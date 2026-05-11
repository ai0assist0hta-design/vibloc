/**
 * Build the best-possible "open this tenant" link from whatever
 * fields OSM gave us.
 *
 * Strategy (each tier short-circuits the rest):
 *
 *   0. Wikidata id  → `https://www.wikidata.org/wiki/Q…` is too
 *      generic for a "go visit this place" CTA, so we use it only
 *      indirectly: a wikidata id implies the tenant is a real
 *      brand, which means the Maps name search has high recall.
 *      No early return.
 *
 *   1. OSM `website` field — chains and notable buildings often
 *      carry their own URL. Open it directly. Best UX for a
 *      "go check this place" intent.
 *
 *   2. Google Maps Place query with **`/@lat,lon,17z` URL format**.
 *      This format actually centers the map at the building's
 *      coordinates AND filters search by that area, so a query
 *      like "Starbucks" lands on the right branch instead of the
 *      Maps result-list page. Without `@lat,lon,zoom` Google falls
 *      back to a free-text search and often shows the search panel
 *      with the query just typed in — which is the symptom we're
 *      fixing.
 *
 *      The format `/maps/search/{query}/@{lat},{lon},{zoom}z` is
 *      documented in Google's URL Schemes docs and matches how
 *      "Share → Copy link" generates links from the Maps app.
 *
 *   3. No coords (very rare — OSM building had no centroid) →
 *      plain `?api=1&query=` fallback (the old behavior).
 */

/** Minimal tenant shape this helper needs. Both `TenantLike` and the
 *  app-side `TenantEntry` satisfy it; we deliberately don't import
 *  either so callers don't get coupled to a specific concrete type. */
type TenantLike = {
  name?: string;
  label?: string;
  website?: string | null;
};

/** Generic OSM labels that don't add any disambiguation power
 *  ("restaurant", "cafe", "shop"). When the tenant.name === the
 *  generic label, including the label in the search makes Google
 *  match worse, not better — it dilutes the brand term. */
const GENERIC_LABELS = new Set([
  'restaurant', 'cafe', 'shop', 'store', 'office', 'hotel',
  'bar', 'pub', 'bakery', 'fast food', 'food', 'retail',
  '식당', '카페', '레스토랑', '상점', '호텔',
  'レストラン', 'カフェ', 'バー', '店',
]);

function buildQuery(tenant: TenantLike): string {
  const name = (tenant.name || '').trim();
  const label = (tenant.label || '').trim();
  if (!name) return label;
  // If the tenant.name *is* the generic label (i.e. OSM didn't
  // carry a brand), don't double it up.
  if (name.toLowerCase() === label.toLowerCase()) return name;
  // If the label is a generic noun, the brand name alone is the
  // strongest signal for Google's geocoder.
  if (GENERIC_LABELS.has(label.toLowerCase())) return name;
  // Otherwise concatenate — gives Google both the brand and the
  // category as ranking hints. Keeps recall high without diluting
  // when the brand alone is enough.
  return `${name} ${label}`;
}

export function tenantClickUrl(
  tenant: TenantLike,
  buildingLat?: number,
  buildingLon?: number,
): string {
  // Tier 1: official website wins — chains and museums carry it,
  // it's the most direct "visit this place" experience.
  if (tenant.website) {
    const w = tenant.website.trim();
    if (/^https?:\/\//i.test(w)) return w;
    if (/^www\./i.test(w))       return `https://${w}`;
    // OSM sometimes stores bare domains — best-effort https.
    if (/\./.test(w))            return `https://${w}`;
  }

  const q = encodeURIComponent(buildQuery(tenant));

  // Tier 2: Google Maps `/search/{q}/@lat,lon,zoom` form. Zoom 18
  // ≈ building level — close enough that Google's place ranker
  // prioritizes establishments inside the same address block over
  // chains in the next neighborhood.
  if (Number.isFinite(buildingLat) && Number.isFinite(buildingLon)) {
    return `https://www.google.com/maps/search/${q}/@${buildingLat},${buildingLon},18z`;
  }

  // Tier 3: no coords. Plain api=1 search.
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
