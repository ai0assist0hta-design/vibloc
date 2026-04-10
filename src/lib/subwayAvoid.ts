/**
 * Subway / underground avoidance for Street View previews.
 *
 * Why this exists
 * ---------------
 * The user wants Google Street View as the inline preview ("Google Maps
 * supports it, so use that"), but explicitly bans subway / underground
 * interior snaps ("지하철 프리뷰는 금지"). Google's `cbll` snap picks the
 * closest pano to the supplied point, and in dense Tokyo / Seoul the
 * closest pano to a road point near a station is sometimes a Photo
 * Sphere captured INSIDE the station concourse — even with
 * `source=outdoor` on the embed URL, the legacy `svembed` surface still
 * lands on it.
 *
 * Without a Google Maps API key we cannot ask Street View Static
 * metadata "is the closest pano indoor?". So instead we sanitize the
 * coordinate BEFORE we hand it to Google: we look up subway entrances
 * and station nodes from OpenStreetMap via the public Overpass API,
 * and if our viewpoint is too close to any of them we push it away in
 * the opposite bearing. The shifted point is still on the surface and
 * still near the building, but it's reliably far enough from any
 * known station mouth that Google's snap lands on a regular road pano.
 *
 * Mechanism (key-free, all client-side):
 *   1. Overpass `node[railway=subway_entrance]`,
 *      `node[railway=train_station_entrance]`,
 *      `node[public_transport=station]`,
 *      `node[highway=elevator]`,
 *      `node[entrance=yes]` within ~150 m of the supplied lat/lon.
 *   2. Convert to a flat list of {lat, lon, kind}.
 *   3. `nudgeAwayFromStations` finds the closest entrance; if it's
 *      within `minDistM` metres, it computes the bearing FROM the
 *      entrance TO the viewpoint and projects the viewpoint along
 *      that bearing by `pushM` metres total (so the final separation
 *      is `pushM`).
 *
 * Performance: one Overpass call per building click. Overpass instances
 * are CORS-enabled and respond in ~100–400 ms for a 150 m bbox query.
 * Results are cached per (lat, lon) rounded to 5 decimals so panning
 * around in the same building doesn't re-fetch.
 *
 * Security:
 *   - Fetch is to `overpass-api.de` only, with `credentials: 'omit'`.
 *   - Only the building's already-public lat/lon is sent.
 *   - Response is parsed as JSON; we never eval anything.
 */

const OVERPASS = 'https://overpass-api.de/api/interpreter';

export type StationFeature = {
  lat: number;
  lon: number;
  kind: string;
};

type OverpassNode = {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassNode[];
};

const cache = new Map<string, StationFeature[]>();

function cacheKey(lat: number, lon: number, radius: number): string {
  return `${lat.toFixed(5)}|${lon.toFixed(5)}|${radius}`;
}

/**
 * Fetch subway / train station entrance nodes near a coordinate.
 * Returns an empty array on any failure (network, parse, abort) — the
 * caller should treat "no data" as "skip the avoid step", not as an
 * error.
 */
export async function findNearbyStationFeatures(
  lat: number,
  lon: number,
  radiusM = 150,
  signal?: AbortSignal,
): Promise<StationFeature[]> {
  const key = cacheKey(lat, lon, radiusM);
  const hit = cache.get(key);
  if (hit) return hit;

  // Overpass QL — five node selectors OR'd together. We deliberately
  // include `entrance=yes` because in some Tokyo metro stations the
  // street-level door is tagged only as a generic entrance node on the
  // station building outline, not as `subway_entrance`.
  const ql = `
    [out:json][timeout:8];
    (
      node["railway"="subway_entrance"](around:${radiusM},${lat},${lon});
      node["railway"="train_station_entrance"](around:${radiusM},${lat},${lon});
      node["public_transport"="station"](around:${radiusM},${lat},${lon});
      node["highway"="elevator"](around:${radiusM},${lat},${lon});
      node["entrance"="yes"]["station"](around:${radiusM},${lat},${lon});
    );
    out body;
  `.trim();

  let json: OverpassResponse;
  try {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: `data=${encodeURIComponent(ql)}`,
      credentials: 'omit',
      signal,
    });
    if (!res.ok) {
      cache.set(key, []);
      return [];
    }
    json = await res.json();
  } catch {
    return [];
  }

  const features: StationFeature[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== 'node') continue;
    const tags = el.tags ?? {};
    const kind =
      tags.railway ??
      tags.public_transport ??
      tags.highway ??
      tags.entrance ??
      'station';
    features.push({ lat: el.lat, lon: el.lon, kind });
  }
  cache.set(key, features);
  return features;
}

/**
 * Great-circle distance in metres between two lat/lon points.
 * Equirectangular approximation — accurate to ~0.5% within a city,
 * which is plenty for "is this within 40 m" tests.
 */
function distMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const meanLat = toRad((aLat + bLat) / 2);
  const x = dLon * Math.cos(meanLat);
  const y = dLat;
  return Math.sqrt(x * x + y * y) * R;
}

/**
 * Project a lat/lon point along a bearing by `metres` metres. Bearing
 * is given as the unit vector (dxLat, dxLon) on the local tangent
 * plane (we don't need north-up bearings here).
 */
function projectLatLon(
  lat: number,
  lon: number,
  dirLat: number,
  dirLon: number,
  metres: number,
): { lat: number; lon: number } {
  const R = 6371000;
  const len = Math.sqrt(dirLat * dirLat + dirLon * dirLon) || 1;
  const ux = dirLat / len;
  const uy = dirLon / len;
  // Lat: 1° ≈ 111_320 m. Lon: 1° ≈ 111_320 * cos(lat) m.
  const dLat = (ux * metres) / 111320;
  const dLon = (uy * metres) / (111320 * Math.cos((lat * Math.PI) / 180));
  void R;
  return { lat: lat + dLat, lon: lon + dLon };
}

export type NudgeResult = {
  lat: number;
  lon: number;
  /** True if we actually moved the point (i.e. an entrance was within `minDistM`). */
  shifted: boolean;
  /** Closest station-feature distance in metres (informational). */
  closestDistM: number | null;
  /** The kind of feature that was closest (e.g. "subway_entrance"). */
  closestKind: string | null;
};

/**
 * Push a viewpoint AWAY from the closest subway/station entrance, if
 * one is within `minDistM` metres. The result is guaranteed to be
 * `pushM` metres from that entrance (or unchanged if no entrance is
 * close enough to matter).
 *
 * The bearing used is the vector FROM the entrance TO the input point
 * — so we slide the camera farther in the direction it was already
 * naturally facing relative to the station. This is the opposite of
 * "march toward the road"; we don't try to land on a road, just to
 * land *far enough from the station mouth* that Google's nearest pano
 * is no longer the indoor concourse capture.
 *
 * Tunable defaults
 * ----------------
 * - `minDistM = 40`: anything within ~40 m of an entrance is at high
 *   risk of an indoor snap (the underground concourse extends roughly
 *   that far in all directions in dense networks).
 * - `pushM = 70`: 70 m is roughly two car lanes plus a sidewalk, far
 *   enough that the closest pano on Google's car-pano network is
 *   reliably above ground.
 */
export function nudgeAwayFromStations(
  lat: number,
  lon: number,
  features: readonly StationFeature[],
  minDistM = 40,
  pushM = 70,
): NudgeResult {
  if (features.length === 0) {
    return { lat, lon, shifted: false, closestDistM: null, closestKind: null };
  }
  let bestDist = Infinity;
  let bestFeature: StationFeature | null = null;
  for (const f of features) {
    const d = distMeters(lat, lon, f.lat, f.lon);
    if (d < bestDist) {
      bestDist = d;
      bestFeature = f;
    }
  }
  if (!bestFeature || bestDist >= minDistM) {
    return {
      lat,
      lon,
      shifted: false,
      closestDistM: bestFeature ? bestDist : null,
      closestKind: bestFeature?.kind ?? null,
    };
  }
  // Bearing from the entrance to the input point. If the input IS the
  // entrance (dist ≈ 0), pick an arbitrary northward bearing so we
  // still move away.
  const dirLat = lat - bestFeature.lat;
  const dirLon = lon - bestFeature.lon;
  const len = Math.sqrt(dirLat * dirLat + dirLon * dirLon);
  const safeLat = len < 1e-9 ? 1 : dirLat;
  const safeLon = len < 1e-9 ? 0 : dirLon;
  const projected = projectLatLon(bestFeature.lat, bestFeature.lon, safeLat, safeLon, pushM);
  return {
    lat: projected.lat,
    lon: projected.lon,
    shifted: true,
    closestDistM: bestDist,
    closestKind: bestFeature.kind,
  };
}
