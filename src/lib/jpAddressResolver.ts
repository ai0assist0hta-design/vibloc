/**
 * Japanese address resolver — fall-back layer for VIBLOC search.
 *
 * Uses a small static JSON (`/data/jp_addresses.json`) compiled at build time
 * from Geolonia's japanese-addresses-v2 dataset, which is itself derived from
 * 国土交通省「位置参照情報」 (Japanese government, public domain). The dataset
 * maps every chome / 町字 in Shinjuku-ku and Shibuya-ku to one or more
 * (lat, lng) representative points.
 *
 * Security model
 * --------------
 * - Runtime makes ZERO third-party requests; the JSON is served from our own
 *   origin.
 * - The JSON is small (~19 KB), human-readable, checked into the repo.
 * - License attribution is embedded in the file itself.
 *
 * How it's used
 * -------------
 * 1. SearchBar tries its local exact / fuzzy address match first.
 * 2. If that finds nothing, it asks this resolver to map the query to a
 *    centroid.
 * 3. Caller converts the centroid to local meters and snaps to the closest
 *    building footprint within a small radius.
 */

import type { OSMBuilding } from './osmLoader';

type TownEntry = {
  town: string;
  town_en: string;
  lat: number;
  lng: number;
};

type JPDataset = {
  cities: Record<string, TownEntry[]>;
};

let _cache: JPDataset | null = null;
let _inflight: Promise<JPDataset | null> | null = null;

async function loadJPDataset(): Promise<JPDataset | null> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const res = await fetch('/data/jp_addresses.json');
      if (!res.ok) return null;
      const data = (await res.json()) as JPDataset;
      _cache = data;
      return data;
    } catch {
      return null;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

/**
 * Normalize a free-text JP query so we can run substring matches against the
 * Geolonia town list. Lowercases ASCII, strips punctuation, unifies dashes.
 */
function normalizeQuery(s: string): string {
  return s
    .toLowerCase()
    .replace(/[〒,()。·]/g, ' ')
    .replace(/[‐-‒–—―−ー－]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Try to resolve a free-text JP query into a single town centroid.
 * Returns null if the query mentions no town we know about.
 */
async function resolveCentroid(
  area: 'shinjuku' | 'shibuya',
  query: string,
): Promise<{ lat: number; lng: number } | null> {
  const data = await loadJPDataset();
  if (!data) return null;
  const towns = data.cities[area];
  if (!towns || towns.length === 0) return null;

  const qNorm = normalizeQuery(query);

  // Find every town whose Japanese OR romanized name appears in the query.
  // Score by name length so longer matches (more specific) win over short
  // ones — e.g. "Nishishinjuku" should beat the generic "Shinjuku".
  let bestTown: TownEntry | null = null;
  let bestNameLen = 0;
  for (const t of towns) {
    const ja = t.town;
    const en = (t.town_en || '').toLowerCase();
    let matched = false;
    let len = 0;
    if (ja && query.includes(ja)) {
      matched = true;
      len = Math.max(len, ja.length * 2); // weight kanji higher
    }
    if (en && en.length >= 4 && qNorm.includes(en)) {
      matched = true;
      len = Math.max(len, en.length);
    }
    if (matched && len > bestNameLen) {
      bestTown = t;
      bestNameLen = len;
    }
  }

  if (!bestTown) return null;

  // If the query mentions a chome number, prefer the centroid of THAT chome.
  // Geolonia stores multiple centroids per town (one per chome). We don't
  // know which centroid corresponds to which chome ordinal, so we just stick
  // with the longest-name match's first occurrence — already done above.
  return { lat: bestTown.lat, lng: bestTown.lng };
}

/**
 * Convert a lat/lng centroid to local meters using the same projection
 * `osmLoader` uses, then return the building closest to that point within
 * `maxMeters`.
 */
function findNearestBuilding(
  lat: number,
  lng: number,
  refLat: number,
  refLon: number,
  buildings: OSMBuilding[],
  maxMeters: number,
): OSMBuilding | null {
  // Same forward projection as latLonToMeters in osmLoader.
  const x = (lng - refLon) * 111320 * Math.cos((refLat * Math.PI) / 180);
  const z = (lat - refLat) * 110540;

  let best: OSMBuilding | null = null;
  let bestD = Infinity;
  for (const b of buildings) {
    const dx = b.center[0] - x;
    const dz = b.center[1] - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD && d <= maxMeters) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/**
 * Public entry point. Returns the building VIBLOC should select for this
 * query, or null when the resolver can't help. Caller is expected to fall
 * back to its existing flow on null.
 */
export async function resolveJPBuilding(
  area: 'shinjuku' | 'shibuya',
  query: string,
  buildings: OSMBuilding[],
  refLat: number,
  refLon: number,
  maxMeters = 150,
): Promise<OSMBuilding | null> {
  const centroid = await resolveCentroid(area, query);
  if (!centroid) return null;
  return findNearestBuilding(centroid.lat, centroid.lng, refLat, refLon, buildings, maxMeters);
}
