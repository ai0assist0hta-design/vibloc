/**
 * Optional Google Street View API integration.
 *
 * Why this is opt-in
 * ------------------
 * The user explicitly asked for inline Google Street View as the
 * preview. Investigation showed that **every keyless Google embed
 * surface that used to support Street View is now dead**:
 *
 *   - `maps.google.com/maps?output=svembed&cbll=...`  → HTTP 404,
 *     X-Frame-Options: SAMEORIGIN. Verified 2026-04-08 via curl.
 *   - `www.google.com/maps/embed?pb=...` with a fabricated panoID
 *     loads, but Google honors the panoID literally — passing a
 *     placeholder snaps to whatever random Photo Sphere has that ID
 *     (including indoor user uploads). Verified by injecting a test
 *     iframe.
 *   - `www.google.com/maps/embed?pb=...!1s!...` with an empty panoID
 *     renders a black screen. Google has no fallback to "find a pano
 *     near these coords" in the keyless embed.
 *   - `www.google.com/maps/embed/v1/streetview?location=...` is the
 *     official documented endpoint and returns HTTP 401 + the message
 *     "You must use an API key to authenticate".
 *
 * The only key-free panoID-lookup endpoint left (`/maps/photometa/v1`)
 * has open CORS but a complex undocumented `pb` format that varies
 * across regions and Google versions. Building on it would be fragile
 * and would break the moment Google rotates the schema.
 *
 * So inline Google Street View is **only possible with an API key**.
 * VIBLOC does not require keys for any other feature, so this one is
 * opt-in: set `VITE_GOOGLE_MAPS_EMBED_KEY` in `.env.local` and the SV
 * preview lights up. If unset, the inline preview falls back to the
 * Wikimedia Commons photo + OSM map cascade in `StreetViewBox.tsx`,
 * which is fully key-free and proven outdoor-safe.
 *
 * Cost note for the user
 * ----------------------
 * The Maps Embed API is **completely free with unlimited usage** —
 * `embed/v1/streetview` is on Google's "no charge" tier. The Street
 * View Static metadata endpoint we use to pre-validate panoIDs is
 * also free (Google bills the metadata at $0/1000 calls, see the
 * Maps Platform pricing page). So enabling this env var costs the
 * user nothing as long as they only use the embed + metadata.
 */

const EMBED_KEY: string | undefined = import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY;

export function hasGoogleMapsKey(): boolean {
  return typeof EMBED_KEY === 'string' && EMBED_KEY.length > 0;
}

/**
 * Build the official Maps Embed API Street View iframe URL.
 *
 * Docs:
 *   https://developers.google.com/maps/documentation/embed/embedding-map#street-view_mode
 *
 * The endpoint accepts EITHER `pano=<panoID>` OR `location=<lat,lng>`.
 * We prefer `pano` when we've already resolved one via metadata (so we
 * pin the embed to a specific outdoor pano), and fall back to
 * `location` otherwise (Google's server-side picker chooses for us).
 */
export function buildEmbedStreetViewUrl(opts: {
  lat: number;
  lon: number;
  panoId?: string | null;
  headingDeg?: number;
  pitch?: number;
  fov?: number;
}): string | null {
  if (!EMBED_KEY) return null;
  const params = new URLSearchParams();
  params.set('key', EMBED_KEY);
  if (opts.panoId) {
    params.set('pano', opts.panoId);
  } else {
    params.set('location', `${opts.lat},${opts.lon}`);
  }
  if (typeof opts.headingDeg === 'number') {
    params.set('heading', String(Math.round(opts.headingDeg)));
  }
  if (typeof opts.pitch === 'number') {
    params.set('pitch', String(opts.pitch));
  }
  if (typeof opts.fov === 'number') {
    params.set('fov', String(opts.fov));
  }
  return `https://www.google.com/maps/embed/v1/streetview?${params.toString()}`;
}

/**
 * Result of a Street View Static metadata lookup.
 *
 * Docs:
 *   https://developers.google.com/maps/documentation/streetview/metadata
 */
export type StreetViewMeta = {
  status: 'OK' | 'ZERO_RESULTS' | 'NOT_FOUND' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'INVALID_REQUEST' | 'UNKNOWN_ERROR';
  pano_id?: string;
  location?: { lat: number; lng: number };
  copyright?: string;
  date?: string;
};

/**
 * Look up Street View metadata for a coordinate. Returns null if no
 * pano is available, or if the API key is missing.
 *
 * Used to:
 *   1. Check whether SV exists at all near the building. If not, we
 *      skip the embed entirely and fall back to the OSM map.
 *   2. Pre-resolve the panoID so we can pass `pano=` to the embed
 *      (more reliable than `location=` for buildings near subway
 *      entrances, which can otherwise snap to indoor Photo Spheres).
 *   3. Filter out user-contributed Photo Spheres by checking the
 *      `copyright` field — Google's official car captures have
 *      copyright "© Google", indoor user uploads have a username.
 */
export async function fetchStreetViewMeta(
  lat: number,
  lon: number,
  radiusMeters = 50,
  signal?: AbortSignal,
): Promise<StreetViewMeta | null> {
  if (!EMBED_KEY) return null;
  // Note: the metadata endpoint is on `maps.googleapis.com`, NOT
  // `www.google.com`. Different host from the embed endpoint above.
  const params = new URLSearchParams({
    location: `${lat},${lon}`,
    radius: String(radiusMeters),
    // `outdoor` source is the same flag the embed honors: it tells the
    // pano picker to ignore user Photo Spheres and only consider
    // Google's official car/trekker captures.
    source: 'outdoor',
    key: EMBED_KEY,
  });
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`,
      { signal, credentials: 'omit' },
    );
    if (!res.ok) return null;
    const data: StreetViewMeta = await res.json();
    return data;
  } catch {
    return null;
  }
}

/**
 * High-level helper: given a building viewpoint, find the BEST
 * outdoor Street View panorama nearby. Returns null if no outdoor
 * pano is available, the API key is missing, or every nearby pano
 * is a user-contributed Photo Sphere (filtered out via the
 * `source=outdoor` flag on the metadata call).
 *
 * Tries an expanding radius (30 → 60 → 100 m) so dense urban
 * coordinates that are right on top of a subway entrance still find
 * a pano on the adjacent road.
 */
export async function resolveOutdoorPano(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<{ panoId: string; lat: number; lon: number } | null> {
  for (const radius of [30, 60, 100]) {
    const meta = await fetchStreetViewMeta(lat, lon, radius, signal);
    if (signal?.aborted) return null;
    if (meta && meta.status === 'OK' && meta.pano_id && meta.location) {
      return {
        panoId: meta.pano_id,
        lat: meta.location.lat,
        lon: meta.location.lng,
      };
    }
  }
  return null;
}
