/**
 * Find an outdoor photo of a building from Wikimedia Commons.
 *
 * Why this exists
 * ---------------
 * The user banned subway / lobby / arcade interiors from the inline
 * preview ("지하철 프리뷰는 금지"). Every panorama service we tried
 * (Google Street View svembed, Mapillary coord embed) eventually
 * snapped to an indoor pano in some Tokyo/Seoul case — either because
 * the closest pano *is* an indoor Photo Sphere (Google), or because
 * the embed needs an `image_key` we don't have (Mapillary).
 *
 * This module replaces the panorama with a curated **Wikimedia
 * Commons** photo. Commons is a human-uploaded archive — virtually
 * every building photo on it is taken from the street, outdoors. Plus
 * we explicitly filter file names that contain interior keywords as a
 * second safety net.
 *
 * Mechanism (multi-stage, all key-free):
 *   1. Commons `list=geosearch` finds File: pages within `radius`
 *      metres of the building.
 *   2. We score candidates: penalise file names that look indoor
 *      (interior / lobby / station / platform / hallway / 内部 / 内 /
 *      内装 / 室内 / etc.), prefer ones whose name contains the
 *      building's own name when supplied.
 *   3. `prop=imageinfo&iiurlwidth=400` resolves the survivor to a
 *      thumbnail URL we can drop straight into an `<img src>`.
 *
 * Web reference points used while designing the filter list:
 *   - Wikimedia Commons API docs: action=query / prop=imageinfo /
 *     list=geosearch (https://commons.wikimedia.org/w/api.php).
 *   - r/openstreetmap thread on building photo enrichment.
 *   - Wikidata P18 ("image") which itself sources from Commons —
 *     same provenance, narrower coverage, so we use Commons direct.
 *
 * CORS: Wikimedia Commons sets `Access-Control-Allow-Origin: *` for
 * its API, so the fetch works from any browser origin without a
 * proxy. `origin=*` in the query string is required to opt in.
 */

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

// File-name fragments that strongly indicate the photo is taken
// indoors. Multilingual because Tokyo/Seoul/Manhattan landmarks have
// CJK + Latin filenames mixed. Lower-cased before matching.
const INDOOR_DENY: readonly string[] = [
  // English
  'interior', 'inside', 'lobby', 'atrium', 'hallway', 'corridor',
  'staircase', 'stairs', 'escalator', 'platform', 'concourse',
  'station_interior', 'inside_station', 'underground', 'basement',
  'restroom', 'toilet', 'elevator', 'mall', 'food_court', 'arcade',
  'indoor', 'lift', 'subway_platform', 'metro_platform',
  'ticket_hall', 'ticket_gate', 'gate', 'fare_gate',
  // Japanese
  '内部', '内装', '室内', 'ロビー', '改札', 'ホーム', '構内',
  '通路', '地下', '駅構内', 'コンコース',
  // Korean
  '내부', '실내', '로비', '복도', '계단', '지하', '승강장', '개찰구',
];

// Source-name fragments that specifically indicate a subway/metro
// station environment. These get an extra-strong negative score so
// even an ambiguous "Subway Sign at X" gets pushed below an outdoor
// candidate.
const SUBWAY_DENY: readonly string[] = [
  'subway', 'metro', 'underground_station', 'tube_station',
  '地下鉄', '메트로', '지하철', '駅', '역사',
];

// File extensions Commons commonly serves and we can drop into <img>.
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif)(?:$|\?)/i;

type GeoSearchResult = {
  pageid: number;
  ns: number;
  title: string; // "File:Foo.jpg"
  lat: number;
  lon: number;
  dist: number;
};

type ImageInfo = {
  thumburl: string;
  url: string;
  width: number;
  height: number;
  thumbwidth: number;
  thumbheight: number;
};

type ImageInfoPage = {
  pageid: number;
  title: string;
  imageinfo?: ImageInfo[];
};

type CommonsImageHit = {
  /** Direct, hot-linkable thumbnail URL (~400 px wide) we can put in <img>. */
  thumbUrl: string;
  /** Full-resolution Commons URL (for the "view source" deeplink). */
  fullUrl: string;
  /** File: page title — used for credit / debugging. */
  title: string;
  /** Distance in metres from query point — sometimes useful for UI. */
  dist: number;
};

/**
 * Score a candidate. Lower is better. -∞ would never win; +∞ always wins.
 *
 * The score is:
 *   - dist (raw metres)                    — closer wins
 *   - +200 if the file name matches any INDOOR_DENY token
 *   - +400 if the file name matches any SUBWAY_DENY token
 *   - -150 if the file name contains the supplied building name
 *
 * The thresholds are tuned so an outdoor file 80 m away beats an
 * indoor file 5 m away (5 + 200 = 205 > 80) and a building-named
 * outdoor file 80 m away beats a generic outdoor file 5 m away
 * (5 vs 80 - 150 = -70).
 */
function scoreCandidate(
  r: GeoSearchResult,
  buildingNameLower: string | null,
): number {
  const titleLower = r.title.toLowerCase();
  let score = r.dist;
  for (const tok of INDOOR_DENY) {
    if (titleLower.includes(tok.toLowerCase())) {
      score += 200;
      break;
    }
  }
  for (const tok of SUBWAY_DENY) {
    if (titleLower.includes(tok.toLowerCase())) {
      score += 400;
      break;
    }
  }
  if (buildingNameLower && buildingNameLower.length >= 4) {
    if (titleLower.includes(buildingNameLower)) {
      score -= 150;
    }
  }
  return score;
}

/**
 * Find an outdoor Commons photo near the building. Returns null if no
 * usable photo is found within `radiusMeters`.
 */
export async function findCommonsBuildingPhoto(
  lat: number,
  lon: number,
  buildingName?: string | null,
  radiusMeters = 120,
  signal?: AbortSignal,
): Promise<CommonsImageHit | null> {
  // Stage 1 — geosearch for File pages near the coordinate.
  const geoParams = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    list: 'geosearch',
    gscoord: `${lat}|${lon}`,
    gsradius: String(radiusMeters),
    gslimit: '20',
    gsnamespace: '6', // File:
  });
  let geoData: { query?: { geosearch?: GeoSearchResult[] } };
  try {
    const res = await fetch(`${COMMONS_API}?${geoParams.toString()}`, {
      signal,
      // Commons returns JSON; no credentials needed.
      credentials: 'omit',
    });
    if (!res.ok) return null;
    geoData = await res.json();
  } catch {
    return null;
  }
  const hits = geoData.query?.geosearch ?? [];
  if (hits.length === 0) return null;

  // Filter out non-image extensions before scoring (Commons can also
  // return SVG, OGV, PDF, etc.)
  const imageHits = hits.filter((h) => ALLOWED_EXT.test(h.title));
  if (imageHits.length === 0) return null;

  const nameLower = buildingName ? buildingName.trim().toLowerCase() : null;
  imageHits.sort((a, b) => scoreCandidate(a, nameLower) - scoreCandidate(b, nameLower));

  // Take the top-scoring candidate that doesn't trigger ANY indoor or
  // subway deny token. We never serve a denied photo even if it's the
  // only thing nearby — better to fall back to the OSM map.
  let chosen: GeoSearchResult | null = null;
  for (const h of imageHits) {
    const t = h.title.toLowerCase();
    const indoor = INDOOR_DENY.some((tok) => t.includes(tok.toLowerCase()));
    const subway = SUBWAY_DENY.some((tok) => t.includes(tok.toLowerCase()));
    if (indoor || subway) continue;
    chosen = h;
    break;
  }
  if (!chosen) return null;

  // Stage 2 — resolve the chosen file to an imageinfo thumbnail URL.
  const infoParams = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    titles: chosen.title,
    prop: 'imageinfo',
    iiprop: 'url|size',
    iiurlwidth: '400',
  });
  let infoData: { query?: { pages?: Record<string, ImageInfoPage> } };
  try {
    const res = await fetch(`${COMMONS_API}?${infoParams.toString()}`, {
      signal,
      credentials: 'omit',
    });
    if (!res.ok) return null;
    infoData = await res.json();
  } catch {
    return null;
  }
  const pages = infoData.query?.pages ?? {};
  const firstPage = Object.values(pages)[0];
  const ii = firstPage?.imageinfo?.[0];
  if (!ii?.thumburl) return null;

  return {
    thumbUrl: ii.thumburl,
    fullUrl: ii.url,
    title: chosen.title,
    dist: chosen.dist,
  };
}
