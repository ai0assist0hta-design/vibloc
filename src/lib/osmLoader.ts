import brandBlocklistJson from '../data/brandBlocklist.json';

export type BuildingTag = {
  label: string;
  category: 'office' | 'hotel' | 'food' | 'shop' | 'residential' | 'entertainment' | 'religious' | 'education' | 'medical' | 'government' | 'other';
  name?: string; // actual business/tenant name (e.g. "Starbucks", "7-ELEVEN")
};

/**
 * Pre-built blocklist of normalized chain / brand names that show up as
 * ground-floor tenants in our OSM POI extracts. Generated offline by
 * build_brand_blocklist.py from the same _pois.json files we ship in
 * public/data, so the keys are guaranteed to match the runtime normalize()
 * exactly. Used by verifyBuildingNamesAgainstTenants as a second-line
 * suppression rule for tall buildings whose OSM `name` is a known brand
 * even when no perfectly-matching POI was attached to the polygon.
 */
const BRAND_BLOCKLIST: ReadonlySet<string> = new Set(
  (brandBlocklistJson as { names: string[] }).names,
);

export type OSMBuilding = {
  id: string;
  name: string;
  address: string;
  /**
   * True when `address` came from this building's own OSM addr:* tags or a
   * manual override; false when it was borrowed from a neighbor or filled
   * with the locality fallback. Used by search to prefer authoritative
   * holders over propagated copies.
   */
  addressOriginal: boolean;
  height: number;
  levels: number;
  footprint: [number, number][];
  center: [number, number];
  /**
   * Optional preferred coordinate for "navigate here" links — derived from
   * an OSM `entrance=*` node on the building's outer ring (or, failing that,
   * the closest detached entrance node within the polygon). When present,
   * this is the point a pedestrian should actually walk to. Falls back to
   * `center` (footprint centroid) when no entrance node exists.
   */
  entry?: [number, number];
  tags: BuildingTag[];
  /** Wikidata Q-id when matched (e.g. "Q863639"). Persisted so the panel can
   *  hit Wikidata's free CORS-enabled REST API at click time to surface
   *  verified multilingual names, descriptions, and external IDs. */
  wikidataId?: string;
  /** Wikipedia article title for the verified Wikipedia infobox source. */
  wikipediaTitle?: string;
  /** Full Wikipedia URL (preserves the language wiki the title came from). */
  wikipediaUrl?: string;
};

type OverpassElement = {
  type: string;
  id: number;
  nodes?: number[];
  lat?: number;
  lon?: number;
  /** Overpass `out center` puts the centroid of way/relation geometry here. */
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

// Equirectangular projection. We use the convention that the rendered scene's
// world Z axis points NORTH (+Z = north, -Z = south). This matches the
// directional-light / sun-position helper in `lib/sunPosition.ts` which is
// already documented as "0=North(+Z)". Keeping the data layer and the render
// layer on the *same* sign convention means `building.center` is the actual
// world position of the rendered building — no flip required when handing it
// to the camera, focus mask, distance queries, etc.
function latLonToMeters(
  lat: number,
  lon: number,
  refLat: number,
  refLon: number
): [number, number] {
  const x = (lon - refLon) * 111320 * Math.cos((refLat * Math.PI) / 180);
  // North = +Z. Lat increases northwards, so a building north of the ref
  // gets a positive z, matching the renderer convention.
  const z = (lat - refLat) * 110540;
  return [x, z];
}

/** Convert local meters back to lat/lon. Inverse of `latLonToMeters`. */
export function metersToLatLon(
  x: number,
  z: number,
  refLat: number,
  refLon: number
): { lat: number; lon: number } {
  const lat = refLat + z / 110540;
  const lon = refLon + x / (111320 * Math.cos((refLat * Math.PI) / 180));
  return { lat, lon };
}

/** Reverse geocode via Nominatim (OSM free API) */
export async function reverseGeocode(lat: number, lon: number): Promise<{ name: string; address: string } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=en,ja,ko`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VIBLOC/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const name = data.name || '';
    const addr = data.address || {};
    // Build readable address
    const parts: string[] = [];
    if (addr.road) parts.push(addr.road);
    if (addr.house_number) parts.push(addr.house_number);
    if (!addr.road && addr.neighbourhood) parts.push(addr.neighbourhood);
    if (addr.suburb) parts.push(addr.suburb);
    if (addr.quarter) parts.push(addr.quarter);
    const address = parts.join(', ') || data.display_name?.split(',').slice(0, 3).join(', ') || '';
    return { name, address };
  } catch {
    return null;
  }
}

/**
 * Per-area locality suffix — appended to short OSM addresses so that typing
 * the result into Google maps to the correct physical place.
 */
const AREA_LOCALITY: Record<string, { locality: string; country: 'JP' | 'KR' | 'US' }> = {
  shinjuku: { locality: 'Shinjuku, Tokyo, Japan', country: 'JP' },
  shibuya: { locality: 'Shibuya, Tokyo, Japan', country: 'JP' },
  itaewon: { locality: 'Yongsan-gu, Seoul, South Korea', country: 'KR' },
  gangnam: { locality: 'Gangnam-gu, Seoul, South Korea', country: 'KR' },
  manhattan: { locality: 'New York, NY, USA', country: 'US' },
  la: { locality: 'Los Angeles, CA, USA', country: 'US' },
};

/** Strip Japanese chome suffixes so "渋谷二丁目" → "渋谷" (keeps only the quarter) */
function stripJPChomeSuffix(s: string): string {
  // Remove trailing chome marker + kanji/arabic digit
  return s.replace(/[一二三四五六七八九十〇0-9]+丁目$/u, '').trim();
}

/** Extract chome number (丁目 → digit) from addr:neighbourhood, or null */
function extractJPChome(s: string | undefined): string | null {
  if (!s) return null;
  const map: Record<string, string> = { 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9', 十: '10' };
  // "渋谷二丁目" or "2丁目" or just "2"
  const m = s.match(/([一二三四五六七八九十〇0-9]+)(?:丁目)?$/u);
  if (!m) return null;
  const raw = m[1];
  if (/^[0-9]+$/.test(raw)) return raw;
  return map[raw] || null;
}

// ---- Japanese romanization maps (Google Maps canonical format) ----
// Verified against actual Google Maps search results for each locale.

const JP_PREFECTURE_EN: Record<string, string> = {
  '東京都': 'Tokyo',
  '大阪府': 'Osaka',
  '京都府': 'Kyoto',
  '神奈川県': 'Kanagawa',
};

// Google uses "Ward-Name City" (e.g. 新宿区 → "Shinjuku City"), not "Shinjuku-ku"
const JP_WARD_EN: Record<string, string> = {
  '新宿区': 'Shinjuku City',
  '渋谷区': 'Shibuya City',
  '港区': 'Minato City',
  '千代田区': 'Chiyoda City',
  '中央区': 'Chuo City',
  '豊島区': 'Toshima City',
  '目黒区': 'Meguro City',
  '品川区': 'Shinagawa City',
  '台東区': 'Taito City',
  '文京区': 'Bunkyo City',
};

// Quarters in Shinjuku/Shibuya — covered comprehensively based on OSM audit.
const JP_QUARTER_EN: Record<string, string> = {
  // Shinjuku
  '新宿': 'Shinjuku',
  '歌舞伎町': 'Kabukicho',
  '西新宿': 'Nishishinjuku',
  '千駄ヶ谷': 'Sendagaya',
  '代々木': 'Yoyogi',
  '北新宿': 'Kitashinjuku',
  '新宿御苑前': 'Shinjukugyoenmae',
  // Shibuya
  '神宮前': 'Jingumae',
  '渋谷': 'Shibuya',
  '道玄坂': 'Dogenzaka',
  '北青山': 'Kitaaoyama',
  '南青山': 'Minamiaoyama',
  '東': 'Higashi',
  '宇田川町': 'Udagawacho',
  '桜丘町': 'Sakuragaokacho',
  '神南': 'Jinnan',
  '青葉台': 'Aobadai',
  '円山町': 'Maruyamacho',
  '南平台町': 'Nampeidaicho',
  '鶯谷町': 'Uguisudanicho',
  '代官山町': 'Daikanyamacho',
  '恵比寿西': 'Ebisunishi',
  '恵比寿': 'Ebisu',
  '恵比寿南': 'Ebisuminami',
  '広尾': 'Hiroo',
  '猿楽町': 'Sarugakucho',
  '松濤': 'Shoto',
  '富ヶ谷': 'Tomigaya',
  '上原': 'Uehara',
};

// ---- Korean romanization maps ----
// Google uses English road names + romanized districts for KR addresses.

const KR_DISTRICT_EN: Record<string, string> = {
  '강남구': 'Gangnam-gu',
  '서초구': 'Seocho-gu',
  '용산구': 'Yongsan-gu',
  '중구': 'Jung-gu',
  '종로구': 'Jongno-gu',
  '마포구': 'Mapo-gu',
  '영등포구': 'Yeongdeungpo-gu',
  '송파구': 'Songpa-gu',
  '성동구': 'Seongdong-gu',
  '광진구': 'Gwangjin-gu',
  '동작구': 'Dongjak-gu',
};

const KR_CITY_EN: Record<string, string> = {
  '서울특별시': 'Seoul',
  '서울': 'Seoul',
  '서울시': 'Seoul',
};

// Common Seoul road names — Google prefers the English transliteration.
const KR_ROAD_EN: Record<string, string> = {
  '테헤란로': 'Teheran-ro',
  '강남대로': 'Gangnam-daero',
  '역삼로': 'Yeoksam-ro',
  '선릉로': 'Seolleung-ro',
  '봉은사로': 'Bongeunsa-ro',
  '언주로': 'Eonju-ro',
  '도산대로': 'Dosan-daero',
  '압구정로': 'Apgujeong-ro',
  '학동로': 'Hakdong-ro',
  '논현로': 'Nonhyeon-ro',
  '삼성로': 'Samseong-ro',
  '영동대로': 'Yeongdong-daero',
  '이태원로': 'Itaewon-ro',
  '녹사평대로': 'Noksapyeong-daero',
  '한남대로': 'Hannam-daero',
  '보광로': 'Bogwang-ro',
  '회나무로': 'Hoenamu-ro',
  '우사단로': 'Usadan-ro',
};

const KR_SUBDISTRICT_EN: Record<string, string> = {
  '역삼동': 'Yeoksam-dong',
  '삼성동': 'Samseong-dong',
  '청담동': 'Cheongdam-dong',
  '논현동': 'Nonhyeon-dong',
  '압구정동': 'Apgujeong-dong',
  '신사동': 'Sinsa-dong',
  '도곡동': 'Dogok-dong',
  '대치동': 'Daechi-dong',
  '개포동': 'Gaepo-dong',
  '수서동': 'Suseo-dong',
  '이태원동': 'Itaewon-dong',
  '한남동': 'Hannam-dong',
  '보광동': 'Bogwang-dong',
  '용산동': 'Yongsan-dong',
  '후암동': 'Huam-dong',
};

function romanizeJPPrefecture(s: string | undefined): string {
  if (!s) return 'Tokyo';
  return JP_PREFECTURE_EN[s] || s.replace(/(都|府|県)$/u, '');
}
function romanizeJPWard(s: string | undefined, fallback: string): string {
  if (!s) return fallback;
  if (JP_WARD_EN[s]) return JP_WARD_EN[s];
  // Add 区 if missing so the map hit works (OSM sometimes has just "渋谷")
  if (!s.endsWith('区')) {
    const withKu = s + '区';
    if (JP_WARD_EN[withKu]) return JP_WARD_EN[withKu];
  }
  // Pure fallback: only suffix " City" if it actually ended in 区
  return s.endsWith('区') ? s.replace(/区$/u, '') + ' City' : fallback;
}
function romanizeJPQuarter(s: string | undefined): string {
  if (!s) return '';
  return JP_QUARTER_EN[s] || s;
}
function romanizeKRCity(s: string | undefined): string {
  if (!s) return 'Seoul';
  return KR_CITY_EN[s] || s.replace(/(특별시|광역시|시)$/u, '');
}
function romanizeKRDistrict(s: string | undefined): string {
  if (!s) return '';
  return KR_DISTRICT_EN[s] || s;
}
function romanizeKRSubdistrict(s: string | undefined): string {
  if (!s) return '';
  return KR_SUBDISTRICT_EN[s] || s;
}
function romanizeKRRoad(s: string | undefined): string {
  if (!s) return '';
  return KR_ROAD_EN[s] || s;
}

/**
 * Build a canonical, Google-searchable address from OSM addr:* tags.
 * The output format matches what Google Maps indexes for each country.
 */
function buildAddressFromTags(
  t: Record<string, string>,
  areaKey?: string
): string {
  const suffixInfo = areaKey ? AREA_LOCALITY[areaKey] : undefined;
  const locality = suffixInfo?.locality ?? '';
  const country = suffixInfo?.country;

  // 1. addr:full — already formatted, trust it but append country if missing
  if (t['addr:full']) {
    const full = t['addr:full'].trim();
    if (country === 'JP' && !/日本|Japan/i.test(full)) return `${full}, Japan`;
    if (country === 'KR' && !/한국|Korea/i.test(full)) return `${full}, South Korea`;
    if (country === 'US' && !/USA|United States/i.test(full)) return `${full}, USA`;
    return full;
  }

  if (country === 'US') {
    // Canonical: "350 5th Avenue, New York, NY 10118, USA"
    const parts: string[] = [];
    if (t['addr:housenumber'] && t['addr:street']) {
      parts.push(`${t['addr:housenumber']} ${t['addr:street']}`);
    } else if (t['addr:street']) {
      parts.push(t['addr:street']);
    }
    const city = t['addr:city'] || (areaKey === 'la' ? 'Los Angeles' : 'New York');
    const state = t['addr:state'] || (areaKey === 'la' ? 'CA' : 'NY');
    const post = t['addr:postcode'] || '';
    if (parts.length) {
      parts.push(city);
      parts.push(post ? `${state} ${post}` : state);
      parts.push('USA');
      return parts.join(', ');
    }
    return locality;
  }

  if (country === 'JP') {
    // Google Maps canonical format (English locale), e.g.:
    //   "Japan, 〒160-0021 Tokyo, Shinjuku City, Kabukicho, 1 Chome−29−1"
    //
    // OSM JP addr:* layout:
    //   addr:province      = 東京都
    //   addr:city/suburb   = 新宿区
    //   addr:quarter       = 歌舞伎町           (optional, may be embedded in neighbourhood)
    //   addr:neighbourhood = "1", "1丁目", or "歌舞伎町一丁目"
    //   addr:block_number  = 29
    //   addr:housenumber   = 1
    //   addr:postcode      = 160-0021
    const provinceJP = t['addr:province'] || '東京都';
    const wardJP = t['addr:suburb'] || t['addr:city']
      || (areaKey === 'shinjuku' ? '新宿区' : areaKey === 'shibuya' ? '渋谷区' : '');

    // Quarter resolution (same as before — strip chome suffix if needed)
    let quarterJP = t['addr:quarter'] || '';
    const nbhd = t['addr:neighbourhood'] || '';
    if (!quarterJP && nbhd) {
      const stripped = stripJPChomeSuffix(nbhd);
      if (stripped && stripped !== nbhd) quarterJP = stripped;
    }
    const chome = extractJPChome(nbhd);
    const block = t['addr:block_number'] || '';
    const house = t['addr:housenumber'] || '';
    const postcode = t['addr:postcode'] || '';

    // Need at least quarter or number data to build a useful address
    if (!quarterJP && !chome && !block && !house) {
      return locality;
    }

    const prefEn = romanizeJPPrefecture(provinceJP);
    const wardEn = romanizeJPWard(wardJP, areaKey === 'shinjuku' ? 'Shinjuku City' : 'Shibuya City');
    const quarterEn = romanizeJPQuarter(quarterJP);

    // Number tail: "1 Chome−29−1" (space before Chome, fullwidth minus U+2212 between block-house)
    const bh: string[] = [];
    if (block) bh.push(block);
    if (house) bh.push(house);
    let tail = '';
    if (chome && bh.length) tail = `${chome} Chome−${bh.join('−')}`;
    else if (chome) tail = `${chome} Chome`;
    else if (bh.length) tail = bh.join('−');

    // Final: "Japan, 〒POST Prefecture, Ward, Quarter, Tail"
    const parts: string[] = ['Japan'];
    let afterJapan = '';
    if (postcode) afterJapan = `〒${postcode} ${prefEn}`;
    else afterJapan = prefEn;
    parts.push(afterJapan);
    if (wardEn) parts.push(wardEn);
    if (quarterEn) parts.push(quarterEn);
    if (tail) parts.push(tail);
    return parts.join(', ');
  }

  if (country === 'KR') {
    // Google Maps canonical KR format (English locale), road-name preferred:
    //   "152 Teheran-ro, Gangnam-gu, Seoul, South Korea"
    // Falls back to jibun format if road-name data absent:
    //   "737 Yeoksam-dong, Gangnam-gu, Seoul, South Korea"
    const cityKR = t['addr:city'] || '서울특별시';
    const districtKR = t['addr:district']
      || (areaKey === 'gangnam' ? '강남구' : areaKey === 'itaewon' ? '용산구' : '');
    const cityEn = romanizeKRCity(cityKR);
    const districtEn = romanizeKRDistrict(districtKR);
    const postcode = t['addr:postcode'] || '';

    // --- Road-name format (preferred) ---
    if (t['addr:street'] && t['addr:housenumber']) {
      const roadEn = romanizeKRRoad(t['addr:street']);
      const parts: string[] = [
        `${t['addr:housenumber']} ${roadEn}`,
        districtEn,
        cityEn,
        'South Korea',
      ].filter(Boolean);
      return postcode ? `${parts.join(', ')} ${postcode}` : parts.join(', ');
    }
    // --- Jibun format (fallback) ---
    if (t['addr:subdistrict'] && t['addr:housenumber']) {
      const subEn = romanizeKRSubdistrict(t['addr:subdistrict']);
      const parts: string[] = [
        `${t['addr:housenumber']} ${subEn}`,
        districtEn,
        cityEn,
        'South Korea',
      ].filter(Boolean);
      return postcode ? `${parts.join(', ')} ${postcode}` : parts.join(', ');
    }
    if (t['addr:subdistrict']) {
      const subEn = romanizeKRSubdistrict(t['addr:subdistrict']);
      return [subEn, districtEn, cityEn, 'South Korea'].filter(Boolean).join(', ');
    }
    if (t['addr:street']) {
      const roadEn = romanizeKRRoad(t['addr:street']);
      return [roadEn, districtEn, cityEn, 'South Korea'].filter(Boolean).join(', ');
    }
    return locality;
  }

  // Generic fallback
  if (t['addr:street'] && t['addr:housenumber']) {
    return `${t['addr:housenumber']} ${t['addr:street']}${locality ? ', ' + locality : ''}`;
  }
  return locality;
}

/** Does a composed address look like a real, Google-resolvable address?
 *  Requires either a digit (housenumber/postcode) or a CJK locality marker. */
function addressIsConcrete(addr: string): boolean {
  if (!addr) return false;
  if (addr.length < 8) return false;
  // US / EU: street number
  if (/\d/.test(addr)) return true;
  // JP: quarter + chome digits covered above; bare locality has no digit
  // KR: road-name would contain digit; bare "서울 강남구" doesn't
  return false;
}

function parseOverpassData(
  elements: OverpassElement[],
  refLat: number,
  refLon: number,
  areaKey?: string
): OSMBuilding[] {
  // Track entrance flag alongside coordinates so building polygons can pick
  // an entry point from their own outer-ring nodes (entrance=main|yes|*).
  const nodes = new Map<number, { lat: number; lon: number; entrance?: string }>();
  const ENTRANCE_RANK: Record<string, number> = {
    main: 0, yes: 1, home: 2, staircase: 3, service: 4, emergency: 5, exit: 6,
  };
  function entranceRank(v: string): number {
    return ENTRANCE_RANK[v] ?? 1;
  }
  for (const el of elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      const ent = el.tags?.entrance;
      nodes.set(el.id, { lat: el.lat, lon: el.lon, entrance: ent });
    }
  }

  const buildings: OSMBuilding[] = [];

  for (const el of elements) {
    if (el.type !== 'way' || !el.tags?.building || !el.nodes) continue;

    // Skip below-ground structures so the surface scene only contains buildings
    // a pedestrian could actually walk into. OSM tags this several ways:
    //   - location=underground   (subway entrances, parking decks, vaults)
    //   - layer < 0              (negative stacking order)
    //   - level / building:levels:underground only and no above-ground levels
    //   - tunnel=yes             (covered passages mapped as buildings)
    //   - indoor=room|area       (interior rooms, never the building shell)
    // Each test on its own would over-filter, so we OR them and keep anything
    // that has at least one above-ground signal (height/levels > 0).
    {
      const bt = el.tags;
      if (bt.location === 'underground') continue;
      if (bt.tunnel === 'yes') continue;
      if (bt.indoor === 'room' || bt.indoor === 'area') continue;
      const layerNum = parseInt((bt.layer || '0').split(';')[0]) || 0;
      if (layerNum < 0) continue;
      const lvlTag = bt.level || bt['building:levels'];
      if (lvlTag) {
        // "-1" → underground only; "-2;-1" → underground only; "-1;0" → mixed (keep)
        const lvls = lvlTag
          .split(/[;,]/)
          .map((s) => parseFloat(s.trim()))
          .filter((n) => !Number.isNaN(n));
        if (lvls.length > 0 && lvls.every((n) => n < 0)) continue;
      }
    }

    const footprint: [number, number][] = [];
    for (const nodeId of el.nodes) {
      const node = nodes.get(nodeId);
      if (!node) continue;
      footprint.push(latLonToMeters(node.lat, node.lon, refLat, refLon));
    }
    if (footprint.length < 3) continue;

    // --- Height calculation: use real data, estimate if missing ---
    let height = 0;
    let heightSource: 'data' | 'estimated' = 'data';
    const htag = el.tags.height;
    const ltag = el.tags['building:levels'];

    if (htag) {
      // Parse height tag — handle "37;35" (take first), "45 m", "121.45", "12'" (feet)
      const hstr = htag.split(';')[0].split(',')[0].trim();
      if (hstr.includes("'") || hstr.toLowerCase().includes('ft')) {
        // Feet to meters
        height = (parseFloat(hstr.replace(/[^0-9.]/g, '')) || 0) * 0.3048;
      } else {
        height = parseFloat(hstr.replace(/[^0-9.]/g, '')) || 0;
      }
    }
    if (!height && ltag) {
      const lstr = ltag.split(';')[0].split(',')[0].trim();
      const levels = parseFloat(lstr.replace(/[^0-9.]/g, '')) || 0;
      if (levels > 0) height = levels * 3.5;
    }

    // If no real data, estimate from footprint area + building type
    if (!height) {
      heightSource = 'estimated';

      // Calculate footprint area (shoelace formula)
      let area = 0;
      for (let i = 0; i < footprint.length; i++) {
        const j = (i + 1) % footprint.length;
        area += footprint[i][0] * footprint[j][1] - footprint[j][0] * footprint[i][1];
      }
      area = Math.abs(area) / 2;

      // Building type multiplier
      const btype = el.tags.building;
      let typeMultiplier = 1.0;
      if (btype === 'apartments') typeMultiplier = 1.6;
      else if (btype === 'hotel') typeMultiplier = 2.0;
      else if (btype === 'office' || btype === 'commercial') typeMultiplier = 1.4;
      else if (btype === 'retail') typeMultiplier = 0.8;
      else if (btype === 'house' || btype === 'detached' || btype === 'residential') typeMultiplier = 0.6;
      else if (btype === 'school' || btype === 'college' || btype === 'university') typeMultiplier = 0.9;
      else if (btype === 'temple' || btype === 'shrine' || btype === 'church') typeMultiplier = 0.8;
      else if (btype === 'roof' || btype === 'greenhouse') typeMultiplier = 0.3;
      else if (btype === 'warehouse' || btype === 'industrial') typeMultiplier = 0.7;

      // Area-based height estimation (from real Shinjuku data correlation)
      // area < 50m² → avg 12m, 50-100 → 20m, 100-200 → 28m, 200-500 → 30m, 500-1000 → 37m, 1000+ → 60m+
      let baseHeight: number;
      if (area < 30) baseHeight = 8;
      else if (area < 50) baseHeight = 12;
      else if (area < 100) baseHeight = 18;
      else if (area < 200) baseHeight = 24;
      else if (area < 500) baseHeight = 28;
      else if (area < 1000) baseHeight = 35;
      else if (area < 3000) baseHeight = 55;
      else if (area < 5000) baseHeight = 70;
      else baseHeight = 45; // Very large footprint → usually wide/low (stadiums, malls)

      // Add deterministic randomness (±20%) based on position to avoid uniform look
      const seed = (footprint[0][0] * 73856093 + footprint[0][1] * 19349663) | 0;
      const rand = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1; // 0-1
      const variation = 0.8 + rand * 0.4; // 0.8 to 1.2

      height = Math.max(4, baseHeight * typeMultiplier * variation);
    }

    // Floor count
    const levels = ltag
      ? (parseFloat(ltag.replace(/[^0-9.]/g, '')) || Math.max(1, Math.floor(height / 3.5)))
      : Math.max(1, Math.floor(height / 3.5));

    // Area-weighted polygon centroid (shoelace). The previous version used
    // a plain vertex average, which is biased toward vertex-dense parts of
    // the polygon — a curved facade with many nodes shifts the "center"
    // away from the geometric middle by 5–15 m for irregular footprints.
    // The shoelace centroid is the true centre of mass and matches what
    // POI snapping / Street View viewpoint algorithms expect.
    let cx = 0, cz = 0;
    {
      let twiceArea = 0;
      let acx = 0, acz = 0;
      for (let i = 0; i < footprint.length; i++) {
        const [x0, z0] = footprint[i];
        const [x1, z1] = footprint[(i + 1) % footprint.length];
        const cross = x0 * z1 - x1 * z0;
        twiceArea += cross;
        acx += (x0 + x1) * cross;
        acz += (z0 + z1) * cross;
      }
      if (Math.abs(twiceArea) > 1e-6) {
        const sixA = 3 * twiceArea;
        cx = acx / sixA;
        cz = acz / sixA;
      } else {
        // Degenerate (zero-area) polygon — fall back to vertex mean.
        for (const [x, z] of footprint) { cx += x; cz += z; }
        cx /= footprint.length;
        cz /= footprint.length;
      }
    }

    // ---- Entry point: prefer best-ranked entrance node on the way's ring ----
    // Walk the way's own node IDs and look for nodes tagged entrance=*. Pick
    // the lowest-rank (main > yes > home > service > emergency > exit). If
    // none, fall back to any detached entrance node landing inside the
    // polygon. Result is the coordinate a pedestrian should actually walk to.
    let entry: [number, number] | undefined;
    {
      let bestRank = Infinity;
      for (const nodeId of el.nodes) {
        const node = nodes.get(nodeId);
        if (!node || !node.entrance) continue;
        const r = entranceRank(node.entrance);
        if (r < bestRank) {
          bestRank = r;
          const [ex, ez] = latLonToMeters(node.lat, node.lon, refLat, refLon);
          entry = [ex, ez];
        }
      }
    }

    // Build Google-searchable address from available addr:* tags
    const t = el.tags;
    const address = buildAddressFromTags(t, areaKey);

    // Display name — match Google Maps English-locale behavior:
    // prefer `name:en` so the panel shows "Tokyu Kabukicho Tower" not "東急歌舞伎町タワー",
    // consistent with the English address format "Japan, 〒160-0021 Tokyo, Shinjuku City, ...".
    const rawName = t['name:en'] || t.name || t['name:ko'] || t['name:ja'] || '';

    // Reuse the POI extractor for building-way-level POI tags so the building's
    // own name (e.g. "롯데백화점") becomes a named tenant tag, not just a generic type.
    // This catches department stores, hotels, hospitals, schools etc. mapped as a single building.
    const wayPoiTags = extractPOITags(t);
    if (wayPoiTags.length && rawName) {
      for (const wt of wayPoiTags) {
        if (!wt.name || !wt.name.trim()) wt.name = rawName;
      }
    }

    // --- Suppress mis-attributed tenant names on multi-floor buildings ---
    // OSM mappers often slap `name=Starbucks` on a 5-story building way that
    // happens to host a Starbucks on the ground floor. The result is that a
    // huge multi-tenant building gets "represented" by a single small tenant
    // (the user's complaint: "5층 거대 건물인데 카페 이름으로 대표되어 있다").
    //
    // Heuristic: if (a) the building has ≥3 floors, (b) its only POI identity
    // is a "small-tenant" type (food, drink, narrow shop categories — NOT
    // dept_store / mall / hotel / school / hospital etc.), and (c) the OSM
    // building tag is generic (no `building=apartments|hotel|hospital|...`),
    // then the OSM name almost certainly refers to a tenant, not the building.
    // We strip it from the building name so the address becomes the headline,
    // and keep the name as a named tenant tag (already done above).
    let suppressedRawName = rawName;
    if (rawName && wayPoiTags.length > 0) {
      const STRUCTURAL_BUILDING = new Set([
        'apartments', 'residential', 'house', 'detached', 'dormitory',
        'hotel', 'hospital', 'school', 'college', 'university',
        'church', 'temple', 'shrine', 'mosque', 'synagogue', 'cathedral',
        'theatre', 'public', 'civic', 'government', 'train_station',
        'stadium', 'sports_hall', 'museum',
      ]);
      const SMALL_TENANT_CATS = new Set(['food', 'entertainment']);
      const isStructural = !!t.building && STRUCTURAL_BUILDING.has(t.building);
      const allSmallTenant = wayPoiTags.every((wt) => {
        if (SMALL_TENANT_CATS.has(wt.category)) return true;
        // Most shops are tenants — except big-box / mall labels which ARE
        // the building itself.
        if (wt.category === 'shop') {
          const lbl = (wt.label || '').toLowerCase();
          return lbl !== 'dept store' && lbl !== 'mall' && lbl !== 'supermarket';
        }
        return false;
      });
      if (!isStructural && allSmallTenant && levels >= 3) {
        // The rawName belongs to a tenant, not the building. Drop it from the
        // building's display name; address (or "Building") will take over.
        suppressedRawName = '';
      }
    }

    // --- Extract building usage tags ---
    const bTags: BuildingTag[] = [...wayPoiTags];
    const btype = t.building;

    // From building type
    if (btype === 'office' || btype === 'commercial') bTags.push({ label: 'Office', category: 'office' });
    else if (btype === 'hotel') bTags.push({ label: 'Hotel', category: 'hotel' });
    else if (btype === 'apartments' || btype === 'residential') bTags.push({ label: 'Residential', category: 'residential' });
    else if (btype === 'retail') bTags.push({ label: 'Retail', category: 'shop' });
    else if (btype === 'house' || btype === 'detached') bTags.push({ label: 'House', category: 'residential' });
    else if (btype === 'school' || btype === 'college' || btype === 'university') bTags.push({ label: 'Education', category: 'education' });
    else if (btype === 'church' || btype === 'temple' || btype === 'shrine') bTags.push({ label: btype.charAt(0).toUpperCase() + btype.slice(1), category: 'religious' });
    else if (btype === 'hospital') bTags.push({ label: 'Hospital', category: 'medical' });
    else if (btype === 'theatre') bTags.push({ label: 'Theatre', category: 'entertainment' });
    else if (btype === 'warehouse' || btype === 'industrial') bTags.push({ label: 'Industrial', category: 'other' });

    // From amenity
    const amenity = t.amenity;
    if (amenity === 'restaurant') bTags.push({ label: 'Restaurant', category: 'food' });
    else if (amenity === 'cafe') bTags.push({ label: 'Cafe', category: 'food' });
    else if (amenity === 'fast_food') bTags.push({ label: 'Fast Food', category: 'food' });
    else if (amenity === 'bar' || amenity === 'pub') bTags.push({ label: 'Bar', category: 'food' });
    else if (amenity === 'theatre' || amenity === 'cinema') bTags.push({ label: amenity === 'theatre' ? 'Theatre' : 'Cinema', category: 'entertainment' });
    else if (amenity === 'place_of_worship') bTags.push({ label: 'Worship', category: 'religious' });
    else if (amenity === 'hospital' || amenity === 'clinic' || amenity === 'pharmacy') bTags.push({ label: amenity.charAt(0).toUpperCase() + amenity.slice(1), category: 'medical' });
    else if (amenity === 'school' || amenity === 'college' || amenity === 'university' || amenity === 'prep_school' || amenity === 'kindergarten' || amenity === 'language_school' || amenity === 'music_school') bTags.push({ label: 'Education', category: 'education' });
    else if (amenity === 'library') bTags.push({ label: 'Library', category: 'education' });
    else if (amenity === 'police' || amenity === 'fire_station' || amenity === 'townhall') bTags.push({ label: amenity === 'townhall' ? 'Government' : amenity === 'police' ? 'Police' : 'Fire Station', category: 'government' });
    else if (amenity === 'love_hotel') bTags.push({ label: 'Love Hotel', category: 'hotel' });
    // Skip: parking, toilets, vending_machine, etc.

    // From tourism
    const tourism = t.tourism;
    if (tourism === 'hotel' || tourism === 'motel' || tourism === 'hostel') bTags.push({ label: tourism.charAt(0).toUpperCase() + tourism.slice(1), category: 'hotel' });
    else if (tourism === 'museum') bTags.push({ label: 'Museum', category: 'entertainment' });
    else if (tourism === 'attraction') bTags.push({ label: 'Attraction', category: 'entertainment' });

    // From shop
    const shop = t.shop;
    if (shop === 'department_store') bTags.push({ label: 'Dept Store', category: 'shop' });
    else if (shop === 'mall') bTags.push({ label: 'Mall', category: 'shop' });
    else if (shop === 'electronics') bTags.push({ label: 'Electronics', category: 'shop' });
    // Skip minor shops — no catch-all

    // From office
    const office = t.office;
    if (office === 'government') bTags.push({ label: 'Government', category: 'government' });
    else if (office === 'diplomatic') bTags.push({ label: 'Embassy', category: 'government' });
    else if (office && !bTags.some(bt => bt.category === 'office')) bTags.push({ label: 'Office', category: 'office' });

    // Skip cuisine as separate tag — already captured via amenity

    // Deduplicate: same name = same entry; otherwise category+label
    const seen = new Set<string>();
    const uniqueTags = bTags.filter(bt => {
      const key = bt.name && bt.name.trim()
        ? `n:${bt.name.toLowerCase().trim()}`
        : `l:${bt.category}|${bt.label.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    buildings.push({
      id: `osm-${el.id}`,
      name: suppressedRawName || address || 'Building',
      address,
      addressOriginal: addressIsConcrete(address),
      height,
      levels,
      tags: uniqueTags,
      footprint,
      center: [cx, cz],
      ...(entry ? { entry } : {}),
    });
  }

  // ---- Post-pass: drop "envelope" polygons (block-level outlines) --------
  //
  // OSM frequently contains a single large `building=*` way that traces an
  // entire urban block, sitting on top of the ~10 individual building ways
  // it visually contains. Both render → the envelope appears as a giant
  // box stamped over the real buildings, producing the visible "intrusion"
  // overlap the user complained about.
  //
  // Detection rule (conservative — never drops a real building):
  //   1. Build a footprint AABB index.
  //   2. For each candidate A, count how many other buildings have their
  //      centroid strictly inside A's polygon.
  //   3. If ≥ 2 children fall inside A → A is an envelope; drop it.
  //
  // Two children is the threshold because a 1:1 inclusion is more likely
  // a parent + S3DB part pair, while ≥2 inner siblings only happens for
  // block outlines that someone tagged `building=yes`.
  //
  // We also drop a small variant: if A *fully* contains exactly one child
  // B (>95 % of A's bbox area is shared with B AND A.area > 1.5 × B.area),
  // A is a redundant outer trace. This catches mappers who duplicated a
  // building footprint at a coarser resolution.
  {
    type Aabb = { minX: number; minZ: number; maxX: number; maxZ: number; area: number; idx: number };
    const aabbs: Aabb[] = buildings.map((b, idx) => {
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const [x, z] of b.footprint) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const area = Math.max(0, (maxX - minX) * (maxZ - minZ));
      return { minX, minZ, maxX, maxZ, area, idx };
    });
    // Coarse spatial grid keyed on AABB cells (50 m). For envelope queries
    // we walk every cell the candidate's bbox overlaps.
    const CELL_E = 50;
    const grid = new Map<string, number[]>();
    const k = (cx: number, cz: number) => `${cx},${cz}`;
    for (const a of aabbs) {
      const cx0 = Math.floor(a.minX / CELL_E);
      const cz0 = Math.floor(a.minZ / CELL_E);
      const cx1 = Math.floor(a.maxX / CELL_E);
      const cz1 = Math.floor(a.maxZ / CELL_E);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const key = k(cx, cz);
          let arr = grid.get(key);
          if (!arr) { arr = []; grid.set(key, arr); }
          arr.push(a.idx);
        }
      }
    }
    const drop = new Uint8Array(buildings.length);
    // Sort candidate envelopes from largest to smallest so a giant block
    // outline gets dropped before any of its (legitimately overlapping)
    // children get a chance to drop *their* small inner courtyards.
    const order = aabbs.slice().sort((a, b) => b.area - a.area);
    for (const A of order) {
      if (drop[A.idx]) continue;
      // Skip tiny candidates — only block-scale polygons can be envelopes.
      if (A.area < 200) continue;
      const Apoly = buildings[A.idx].footprint;
      // Collect candidate inner buildings via the grid
      const seen = new Set<number>();
      const childIdxs: number[] = [];
      let childAreaSum = 0;
      const cx0 = Math.floor(A.minX / CELL_E);
      const cz0 = Math.floor(A.minZ / CELL_E);
      const cx1 = Math.floor(A.maxX / CELL_E);
      const cz1 = Math.floor(A.maxZ / CELL_E);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const arr = grid.get(k(cx, cz));
          if (!arr) continue;
          for (const j of arr) {
            if (j === A.idx || drop[j] || seen.has(j)) continue;
            seen.add(j);
            const B = aabbs[j];
            // Children must be smaller than the envelope
            if (B.area >= A.area * 0.95) continue;
            // Compute AABB intersection (skip the centroid test — a child
            // whose centroid lies just outside A's polygon can still cover
            // most of A's footprint, e.g. an L-shaped envelope).
            const ix = Math.max(0, Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX));
            const iz = Math.max(0, Math.min(A.maxZ, B.maxZ) - Math.max(A.minZ, B.minZ));
            const inter = ix * iz;
            // Child counts only if its AABB is mostly inside A's AABB.
            if (inter < B.area * 0.6) continue;
            childIdxs.push(j);
            childAreaSum += inter;
          }
        }
      }
      // Decision rules — at least one must hold to drop A as an envelope:
      //   (a) ≥ 2 distinct children AND their combined AABB-intersection
      //       covers ≥ 35 % of A → urban-block outline wrapping a row of
      //       individual buildings (the New Shinjuku Alta failure case)
      //   (b) 1 child whose AABB is ≥ 65 % of A AND the centroid of that
      //       child sits inside A's polygon → coarse trace duplicate
      const coverRatio = childAreaSum / A.area;
      if (childIdxs.length >= 2 && coverRatio >= 0.35) {
        drop[A.idx] = 1;
      } else if (childIdxs.length === 1) {
        const B = aabbs[childIdxs[0]];
        if (B.area >= A.area * 0.65) {
          const [bx, bz] = buildings[childIdxs[0]].center;
          if (pointInPolygon(bx, bz, Apoly)) drop[A.idx] = 1;
        }
      }
    }
    let dropped = 0;
    for (let i = 0; i < drop.length; i++) if (drop[i]) dropped++;
    if (dropped > 0) {
      const filtered: OSMBuilding[] = [];
      for (let i = 0; i < buildings.length; i++) if (!drop[i]) filtered.push(buildings[i]);
      buildings.length = 0;
      for (const b of filtered) buildings.push(b);
      console.log(`[osmLoader] envelope dedup: dropped ${dropped} block-level outlines`);
    }
  }

  // ---- Post-pass: fix addresses that are not Google-searchable ----
  //
  // Strategy (no external APIs, fully deterministic):
  //   1. If the composed address already looks concrete (has a digit) → keep it.
  //   2. Else if the building has a real name → use "{name}, {locality}". This
  //      is what Google actually indexes for famous buildings.
  //   3. Else borrow the concrete address of the nearest neighbor within 80m
  //      (same-block buildings share the same street address to the user).
  //   4. Else fall back to locality alone.
  const suffixInfo = areaKey ? AREA_LOCALITY[areaKey] : undefined;
  const locality = suffixInfo?.locality ?? '';

  // Build a spatial grid of buildings that already have concrete addresses.
  // CELL sized so a 1-ring scan covers the full MAX_NEIGHBOR distance.
  const MAX_NEIGHBOR = 150; // meters — audit showed ≥99% coverage at this radius
  const CELL = MAX_NEIGHBOR; // one ring of neighbors suffices
  const cells = new Map<string, OSMBuilding[]>();
  const cellKey = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  for (const b of buildings) {
    if (addressIsConcrete(b.address)) {
      const k = cellKey(b.center[0], b.center[1]);
      let arr = cells.get(k);
      if (!arr) { arr = []; cells.set(k, arr); }
      arr.push(b);
    }
  }

  for (const b of buildings) {
    if (addressIsConcrete(b.address)) continue;

    // Step 2: named building → "{name}, {locality}"
    // Google indexes famous buildings by name, so this resolves exactly.
    const rawName = b.name;
    const nameIsReal = rawName && rawName !== 'Building' && rawName !== b.address;
    if (nameIsReal && locality) {
      b.address = `${rawName}, ${locality}`;
      b.addressOriginal = false;
      continue;
    }

    // Step 3: borrow nearest neighbor's concrete address (same block / street frontage)
    let best: OSMBuilding | null = null;
    let bestD = Infinity;
    const [cx, cz] = b.center;
    const gx = Math.floor(cx / CELL);
    const gz = Math.floor(cz / CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = cells.get(`${gx + dx},${gz + dz}`);
        if (!arr) continue;
        for (const n of arr) {
          const ddx = n.center[0] - cx;
          const ddz = n.center[1] - cz;
          const d = Math.sqrt(ddx * ddx + ddz * ddz);
          if (d < bestD && d <= MAX_NEIGHBOR) {
            bestD = d;
            best = n;
          }
        }
      }
    }
    if (best) {
      b.address = best.address;
      b.addressOriginal = false;
      continue;
    }

    // Step 4: locality fallback
    if (locality) {
      b.address = locality;
      b.addressOriginal = false;
    }
  }

  return buildings;
}

export const CITY_AREAS = {
  shinjuku: { file: '/data/shinjuku.json', refLat: 35.690, refLon: 139.700, label: '新宿 Shinjuku' },
  shibuya: { file: '/data/shibuya.json', refLat: 35.659, refLon: 139.701, label: '渋谷 Shibuya' },
  itaewon: { file: '/data/itaewon.json', refLat: 37.536, refLon: 126.995, label: '이태원 Itaewon' },
  gangnam: { file: '/data/gangnam.json', refLat: 37.499, refLon: 127.029, label: '강남 Gangnam' },
  manhattan: { file: '/data/manhattan.json', refLat: 40.7565, refLon: -73.983, label: '🗽 Manhattan' },
  la: { file: '/data/la.json', refLat: 34.050, refLon: -118.250, label: '🌴 Los Angeles' },
} as const;

export type CityAreaKey = keyof typeof CITY_AREAS;

// --- POI matching: point-in-polygon to enrich buildings with nearby POI tags ---

type POINode = {
  lat: number;
  lon: number;
  tags: Record<string, string>;
};

function parsePOINodes(elements: OverpassElement[]): POINode[] {
  const pois: POINode[] = [];
  for (const el of elements) {
    if (!el.tags) continue;
    // Node POIs (most common): coordinates are on the element itself.
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      pois.push({ lat: el.lat, lon: el.lon, tags: el.tags });
      continue;
    }
    // Way / relation POIs: Overpass `out center` puts the centroid in
    // `el.center`. These cover restaurants, shops, hotels, etc. that are
    // mapped on the building polygon directly instead of a single node —
    // a major source of "missing tenant" data before this fix.
    if ((el.type === 'way' || el.type === 'relation') && el.center) {
      pois.push({ lat: el.center.lat, lon: el.center.lon, tags: el.tags });
    }
  }
  return pois;
}

/** Ray-casting point-in-polygon test */
function pointInPolygon(px: number, pz: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], zi = polygon[i][1];
    const xj = polygon[j][0], zj = polygon[j][1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// POI types to SKIP — trivial/noise for building usage display
const SKIP_AMENITIES = new Set([
  'toilets', 'bench', 'waste_basket', 'drinking_water', 'telephone',
  'post_box', 'recycling', 'vending_machine', 'atm', 'bicycle_parking',
  'parking', 'parking_space', 'motorcycle_parking', 'shelter', 'clock',
  'photo_booth', 'shower', 'locker', 'luggage_locker', 'water_point',
  'smoking_area', 'charging_station', 'bicycle_rental', 'car_sharing',
  'ticket_validator', 'waste_disposal', 'fountain', 'hunting_stand',
]);

const SKIP_SHOPS = new Set([
  'ticket', 'vacant', 'yes', 'lottery', 'copyshop', 'photo',
  'storage_rental', 'e-cigarette', 'locksmith',
]);

// --- POI category map (data-driven, easier to maintain) ---
type PoiSpec = { label: string; category: BuildingTag['category'] };

const AMENITY_MAP: Record<string, PoiSpec> = {
  restaurant: { label: 'Restaurant', category: 'food' },
  cafe: { label: 'Cafe', category: 'food' },
  fast_food: { label: 'Fast Food', category: 'food' },
  food_court: { label: 'Food Court', category: 'food' },
  ice_cream: { label: 'Ice Cream', category: 'food' },
  bar: { label: 'Bar', category: 'entertainment' },
  pub: { label: 'Pub', category: 'entertainment' },
  biergarten: { label: 'Biergarten', category: 'entertainment' },
  nightclub: { label: 'Nightclub', category: 'entertainment' },
  karaoke_box: { label: 'Karaoke', category: 'entertainment' },
  cinema: { label: 'Cinema', category: 'entertainment' },
  theatre: { label: 'Theatre', category: 'entertainment' },
  arts_centre: { label: 'Arts Centre', category: 'entertainment' },
  studio: { label: 'Studio', category: 'entertainment' },
  events_venue: { label: 'Venue', category: 'entertainment' },
  conference_centre: { label: 'Conference', category: 'office' },
  pharmacy: { label: 'Pharmacy', category: 'medical' },
  clinic: { label: 'Clinic', category: 'medical' },
  doctors: { label: 'Clinic', category: 'medical' },
  dentist: { label: 'Dentist', category: 'medical' },
  hospital: { label: 'Hospital', category: 'medical' },
  veterinary: { label: 'Vet', category: 'medical' },
  bank: { label: 'Bank', category: 'office' },
  bureau_de_change: { label: 'Currency', category: 'office' },
  post_office: { label: 'Post Office', category: 'government' },
  police: { label: 'Police', category: 'government' },
  fire_station: { label: 'Fire Station', category: 'government' },
  townhall: { label: 'City Hall', category: 'government' },
  courthouse: { label: 'Courthouse', category: 'government' },
  embassy: { label: 'Embassy', category: 'government' },
  prison: { label: 'Prison', category: 'government' },
  library: { label: 'Library', category: 'education' },
  school: { label: 'School', category: 'education' },
  college: { label: 'College', category: 'education' },
  university: { label: 'University', category: 'education' },
  kindergarten: { label: 'Kindergarten', category: 'education' },
  language_school: { label: 'Language School', category: 'education' },
  music_school: { label: 'Music School', category: 'education' },
  prep_school: { label: 'Prep School', category: 'education' },
  driving_school: { label: 'Driving School', category: 'education' },
  childcare: { label: 'Childcare', category: 'education' },
  place_of_worship: { label: 'Worship', category: 'religious' },
  monastery: { label: 'Monastery', category: 'religious' },
  community_centre: { label: 'Community', category: 'government' },
  social_facility: { label: 'Social Facility', category: 'government' },
  marketplace: { label: 'Market', category: 'shop' },
  love_hotel: { label: 'Love Hotel', category: 'hotel' },
  fuel: { label: 'Gas Station', category: 'shop' },
  car_rental: { label: 'Car Rental', category: 'shop' },
  car_wash: { label: 'Car Wash', category: 'shop' },
  internet_cafe: { label: 'Internet Cafe', category: 'entertainment' },
  gambling: { label: 'Gambling', category: 'entertainment' },
  casino: { label: 'Casino', category: 'entertainment' },
  stripclub: { label: 'Adult', category: 'entertainment' },
  funeral_hall: { label: 'Funeral', category: 'other' },
  crematorium: { label: 'Crematorium', category: 'other' },
};

const SHOP_MAP: Record<string, PoiSpec> = {
  convenience: { label: 'Convenience', category: 'shop' },
  supermarket: { label: 'Supermarket', category: 'shop' },
  greengrocer: { label: 'Grocer', category: 'shop' },
  butcher: { label: 'Butcher', category: 'shop' },
  seafood: { label: 'Seafood', category: 'shop' },
  deli: { label: 'Deli', category: 'food' },
  bakery: { label: 'Bakery', category: 'food' },
  pastry: { label: 'Pastry', category: 'food' },
  confectionery: { label: 'Confectionery', category: 'food' },
  chocolate: { label: 'Chocolate', category: 'food' },
  coffee: { label: 'Coffee', category: 'food' },
  tea: { label: 'Tea', category: 'food' },
  alcohol: { label: 'Alcohol', category: 'shop' },
  wine: { label: 'Wine', category: 'shop' },
  beverages: { label: 'Beverages', category: 'shop' },
  tobacco: { label: 'Tobacco', category: 'shop' },
  clothes: { label: 'Fashion', category: 'shop' },
  fashion: { label: 'Fashion', category: 'shop' },
  shoes: { label: 'Shoes', category: 'shop' },
  bag: { label: 'Bags', category: 'shop' },
  fashion_accessories: { label: 'Accessories', category: 'shop' },
  watches: { label: 'Watches', category: 'shop' },
  jewelry: { label: 'Jewelry', category: 'shop' },
  jewellery: { label: 'Jewelry', category: 'shop' },
  beauty: { label: 'Beauty', category: 'shop' },
  cosmetics: { label: 'Cosmetics', category: 'shop' },
  hairdresser: { label: 'Hair Salon', category: 'shop' },
  perfumery: { label: 'Perfumery', category: 'shop' },
  optician: { label: 'Optician', category: 'shop' },
  hearing_aids: { label: 'Hearing Aids', category: 'medical' },
  electronics: { label: 'Electronics', category: 'shop' },
  computer: { label: 'Computers', category: 'shop' },
  mobile_phone: { label: 'Mobile', category: 'shop' },
  hifi: { label: 'Hi-Fi', category: 'shop' },
  camera: { label: 'Camera', category: 'shop' },
  video: { label: 'Video', category: 'shop' },
  video_games: { label: 'Games', category: 'shop' },
  music: { label: 'Music', category: 'shop' },
  musical_instrument: { label: 'Instruments', category: 'shop' },
  books: { label: 'Bookstore', category: 'shop' },
  stationery: { label: 'Stationery', category: 'shop' },
  art: { label: 'Art', category: 'shop' },
  craft: { label: 'Craft', category: 'shop' },
  toys: { label: 'Toys', category: 'shop' },
  hobby: { label: 'Hobby', category: 'shop' },
  sports: { label: 'Sports', category: 'shop' },
  outdoor: { label: 'Outdoor', category: 'shop' },
  bicycle: { label: 'Bicycle', category: 'shop' },
  car: { label: 'Car Dealer', category: 'shop' },
  car_parts: { label: 'Car Parts', category: 'shop' },
  car_repair: { label: 'Car Repair', category: 'shop' },
  motorcycle: { label: 'Motorcycle', category: 'shop' },
  furniture: { label: 'Furniture', category: 'shop' },
  interior_decoration: { label: 'Interior', category: 'shop' },
  kitchen: { label: 'Kitchen', category: 'shop' },
  bed: { label: 'Bedding', category: 'shop' },
  carpet: { label: 'Carpet', category: 'shop' },
  curtain: { label: 'Curtain', category: 'shop' },
  doityourself: { label: 'DIY', category: 'shop' },
  hardware: { label: 'Hardware', category: 'shop' },
  paint: { label: 'Paint', category: 'shop' },
  florist: { label: 'Florist', category: 'shop' },
  garden_centre: { label: 'Garden', category: 'shop' },
  pet: { label: 'Pet Shop', category: 'shop' },
  pet_grooming: { label: 'Pet Grooming', category: 'shop' },
  variety_store: { label: 'Variety', category: 'shop' },
  gift: { label: 'Gift', category: 'shop' },
  toys_baby: { label: 'Baby', category: 'shop' },
  baby_goods: { label: 'Baby', category: 'shop' },
  second_hand: { label: 'Thrift', category: 'shop' },
  antiques: { label: 'Antiques', category: 'shop' },
  charity: { label: 'Charity', category: 'shop' },
  department_store: { label: 'Dept Store', category: 'shop' },
  mall: { label: 'Mall', category: 'shop' },
  wholesale: { label: 'Wholesale', category: 'shop' },
  laundry: { label: 'Laundry', category: 'shop' },
  dry_cleaning: { label: 'Dry Cleaning', category: 'shop' },
  tailor: { label: 'Tailor', category: 'shop' },
  tattoo: { label: 'Tattoo', category: 'shop' },
  massage: { label: 'Massage', category: 'shop' },
  travel_agency: { label: 'Travel', category: 'office' },
  estate_agent: { label: 'Real Estate', category: 'office' },
  funeral_directors: { label: 'Funeral', category: 'other' },
};

const TOURISM_MAP: Record<string, PoiSpec> = {
  hotel: { label: 'Hotel', category: 'hotel' },
  hostel: { label: 'Hostel', category: 'hotel' },
  guest_house: { label: 'Guest House', category: 'hotel' },
  motel: { label: 'Motel', category: 'hotel' },
  apartment: { label: 'Serviced Apt', category: 'hotel' },
  museum: { label: 'Museum', category: 'entertainment' },
  gallery: { label: 'Gallery', category: 'entertainment' },
  attraction: { label: 'Attraction', category: 'entertainment' },
  aquarium: { label: 'Aquarium', category: 'entertainment' },
  theme_park: { label: 'Theme Park', category: 'entertainment' },
  zoo: { label: 'Zoo', category: 'entertainment' },
  information: { label: 'Info Center', category: 'government' },
};

const LEISURE_MAP: Record<string, PoiSpec> = {
  fitness_centre: { label: 'Gym', category: 'entertainment' },
  gym: { label: 'Gym', category: 'entertainment' },
  sports_centre: { label: 'Sports Centre', category: 'entertainment' },
  dance: { label: 'Dance Studio', category: 'entertainment' },
  spa: { label: 'Spa', category: 'entertainment' },
  sauna: { label: 'Sauna', category: 'entertainment' },
  bowling_alley: { label: 'Bowling', category: 'entertainment' },
  amusement_arcade: { label: 'Arcade', category: 'entertainment' },
  escape_game: { label: 'Escape Room', category: 'entertainment' },
  adult_gaming_centre: { label: 'Game Centre', category: 'entertainment' },
};

const HEALTHCARE_MAP: Record<string, PoiSpec> = {
  clinic: { label: 'Clinic', category: 'medical' },
  doctor: { label: 'Clinic', category: 'medical' },
  dentist: { label: 'Dentist', category: 'medical' },
  pharmacy: { label: 'Pharmacy', category: 'medical' },
  hospital: { label: 'Hospital', category: 'medical' },
  optometrist: { label: 'Optometrist', category: 'medical' },
  physiotherapist: { label: 'Physio', category: 'medical' },
  psychotherapist: { label: 'Therapist', category: 'medical' },
  alternative: { label: 'Alt Medicine', category: 'medical' },
};

const CRAFT_MAP: Record<string, PoiSpec> = {
  bakery: { label: 'Bakery', category: 'food' },
  brewery: { label: 'Brewery', category: 'food' },
  confectionery: { label: 'Confectionery', category: 'food' },
  carpenter: { label: 'Carpenter', category: 'shop' },
  electrician: { label: 'Electrician', category: 'shop' },
  plumber: { label: 'Plumber', category: 'shop' },
  jeweller: { label: 'Jeweler', category: 'shop' },
  shoemaker: { label: 'Shoemaker', category: 'shop' },
  tailor: { label: 'Tailor', category: 'shop' },
  photographer: { label: 'Photographer', category: 'shop' },
};

/** Extract tags from a POI node — only meaningful categories, with business name */
// Cuisine code → human label (matches Google Maps "Thai restaurant", "Italian restaurant" style)
const CUISINE_LABEL: Record<string, string> = {
  thai: 'Thai', italian: 'Italian', japanese: 'Japanese', chinese: 'Chinese',
  korean: 'Korean', indian: 'Indian', mexican: 'Mexican', french: 'French',
  vietnamese: 'Vietnamese', spanish: 'Spanish', greek: 'Greek', turkish: 'Turkish',
  american: 'American', mediterranean: 'Mediterranean', sushi: 'Sushi',
  ramen: 'Ramen', pizza: 'Pizza', burger: 'Burger', steak_house: 'Steakhouse',
  seafood: 'Seafood', vegetarian: 'Vegetarian', vegan: 'Vegan', bbq: 'BBQ',
  noodle: 'Noodle', dumpling: 'Dumpling', curry: 'Curry', sandwich: 'Sandwich',
  bakery: 'Bakery', dessert: 'Dessert', breakfast: 'Breakfast',
  asian: 'Asian', european: 'European', international: 'International',
  yakiniku: 'Yakiniku', izakaya: 'Izakaya', tempura: 'Tempura',
};

// shop code → friendly label (Google Maps style)
const SHOP_LABEL_OVERRIDE: Record<string, string> = {
  clothes: 'Clothing Shop',
  fashion: 'Fashion Shop',
  fashion_accessories: 'Fashion Shop',
  shoes: 'Shoe Shop',
  bag: 'Bag Shop',
  jewelry: 'Jewelry Shop',
  watches: 'Watch Shop',
  beauty: 'Beauty Shop',
  cosmetics: 'Cosmetics Shop',
  perfumery: 'Perfumery',
  hairdresser: 'Hair Salon',
  optician: 'Optician',
  electronics: 'Electronics Shop',
  mobile_phone: 'Phone Shop',
  computer: 'Computer Shop',
  furniture: 'Furniture Shop',
  interior_decoration: 'Interior Shop',
  books: 'Bookstore',
  stationery: 'Stationery Shop',
  toys: 'Toy Shop',
  sports: 'Sports Shop',
  bicycle: 'Bicycle Shop',
  florist: 'Florist',
  gift: 'Gift Shop',
  variety_store: 'Variety Store',
  convenience: 'Convenience Store',
  supermarket: 'Supermarket',
  bakery: 'Bakery',
  butcher: 'Butcher',
  greengrocer: 'Grocer',
  alcohol: 'Liquor Store',
  wine: 'Wine Shop',
  tea: 'Tea Shop',
  coffee: 'Coffee Shop',
  confectionery: 'Confectionery',
  pharmacy: 'Pharmacy',
  hardware: 'Hardware Shop',
  pet: 'Pet Shop',
};

function extractPOITags(tags: Record<string, string>): BuildingTag[] {
  const result: BuildingTag[] = [];
  const poiName = tags.name || tags['name:en'] || tags['name:ko'] || tags['name:ja'] || tags.brand || '';

  const amenity = tags.amenity;
  if (amenity && SKIP_AMENITIES.has(amenity)) return result;
  if (amenity && AMENITY_MAP[amenity]) {
    const s = AMENITY_MAP[amenity];
    let label = s.label;
    // Specialize restaurants/cafes/bars with cuisine when available.
    // OSM cuisine is semicolon-separated; pick the first known token.
    if ((amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'cafe' || amenity === 'bar' || amenity === 'pub') && tags.cuisine) {
      const tokens = tags.cuisine.toLowerCase().split(/[;,]/).map(x => x.trim());
      for (const tok of tokens) {
        if (CUISINE_LABEL[tok]) {
          label = `${CUISINE_LABEL[tok]} ${s.label}`;
          break;
        }
      }
    }
    result.push({ label, category: s.category, name: poiName });
  }

  const shop = tags.shop;
  if (shop && SKIP_SHOPS.has(shop)) return result;
  if (shop) {
    const override = SHOP_LABEL_OVERRIDE[shop];
    if (override) {
      result.push({ label: override, category: 'shop', name: poiName });
    } else if (SHOP_MAP[shop]) {
      const s = SHOP_MAP[shop];
      result.push({ label: s.label, category: s.category, name: poiName });
    } else {
      // Unknown shop type still meaningful — keep generic Shop with name
      result.push({ label: 'Shop', category: 'shop', name: poiName });
    }
  }

  const office = tags.office;
  if (office === 'government') result.push({ label: 'Government', category: 'government', name: poiName });
  else if (office === 'diplomatic') result.push({ label: 'Embassy', category: 'government', name: poiName });
  // All commercial office subtypes (insurance, lawyer, accountant, IT, coworking,
  // estate agent, company, ...) collapse into the generic "Company" label.
  else if (office) result.push({ label: 'Company', category: 'office', name: poiName });

  const tourism = tags.tourism;
  if (tourism && TOURISM_MAP[tourism]) {
    const s = TOURISM_MAP[tourism];
    result.push({ label: s.label, category: s.category, name: poiName });
  }

  const leisure = tags.leisure;
  if (leisure && LEISURE_MAP[leisure]) {
    const s = LEISURE_MAP[leisure];
    result.push({ label: s.label, category: s.category, name: poiName });
  }

  const healthcare = tags.healthcare;
  if (healthcare && HEALTHCARE_MAP[healthcare]) {
    const s = HEALTHCARE_MAP[healthcare];
    result.push({ label: s.label, category: s.category, name: poiName });
  }

  const craft = tags.craft;
  if (craft && CRAFT_MAP[craft]) {
    const s = CRAFT_MAP[craft];
    result.push({ label: s.label, category: s.category, name: poiName });
  } else if (craft) {
    result.push({ label: 'Workshop', category: 'shop', name: poiName });
  }

  // club=* (japanese izakaya, etc.)
  if (tags.club) {
    result.push({ label: 'Club', category: 'entertainment', name: poiName });
  }

  return result;
}

/** Match POIs to buildings by point-in-polygon, add tags */
function enrichBuildingsWithPOIs(
  buildings: OSMBuilding[],
  pois: POINode[],
  refLat: number,
  refLon: number
): void {
  if (!pois.length) return;

  // Convert POI positions to local meters
  const poiPositions = pois.map(p => latLonToMeters(p.lat, p.lon, refLat, refLon));

  // Build spatial index: divide into grid cells for faster lookup
  const cellSize = 50; // 50m cells
  const cellMap = new Map<string, number[]>();
  for (let i = 0; i < poiPositions.length; i++) {
    const [x, z] = poiPositions[i];
    const cx = Math.floor(x / cellSize);
    const cz = Math.floor(z / cellSize);
    // Check surrounding cells too (POI might be on edge)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        if (!cellMap.has(key)) cellMap.set(key, []);
        cellMap.get(key)!.push(i);
      }
    }
  }

  // Track which POIs have been claimed by a building so they don't get matched twice
  const claimed = new Uint8Array(pois.length);

  // Pass 1: strict point-in-polygon
  for (const building of buildings) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of building.footprint) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    const candidates = new Set<number>();
    const cx0 = Math.floor(minX / cellSize);
    const cx1 = Math.floor(maxX / cellSize);
    const cz0 = Math.floor(minZ / cellSize);
    const cz1 = Math.floor(maxZ / cellSize);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const key = `${cx},${cz}`;
        const indices = cellMap.get(key);
        if (indices) indices.forEach(i => candidates.add(i));
      }
    }

    const matchedTags: BuildingTag[] = [];
    for (const idx of candidates) {
      if (claimed[idx]) continue;
      const [px, pz] = poiPositions[idx];
      if (px < minX || px > maxX || pz < minZ || pz > maxZ) continue;
      if (pointInPolygon(px, pz, building.footprint)) {
        const tags = extractPOITags(pois[idx].tags);
        if (tags.length) {
          matchedTags.push(...tags);
          claimed[idx] = 1;
        }
      }
    }

    if (matchedTags.length > 0) {
      // Merge with existing tags. Dedupe key = name (if present) else category|label,
      // so multiple distinct named businesses with the same label all survive.
      const allTags = [...building.tags, ...matchedTags];
      const seen = new Set<string>();
      building.tags = allTags.filter(t => {
        const key = t.name && t.name.trim()
          ? `name:${t.name.toLowerCase().trim()}`
          : `tl:${t.category}|${t.label.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }

  // Pass 2: snap unclaimed POIs to the closest building EDGE within snapRadius.
  //
  // Why edge-distance (not centroid-distance):
  //   POIs are commonly mapped at the entrance / on the sidewalk just outside
  //   the building polygon. For a 50 m wide tower, that POI may be ~25 m from
  //   the centroid but only ~5 m from the wall. The previous implementation
  //   compared to centroid with an 8 m radius — so it missed almost every
  //   real-world sidewalk-tagged POI on a mid-size+ building. Edge distance
  //   gives a stable physical meaning ("how far is the POI from the building")
  //   independent of building size.
  //
  // Building lookup is now driven by a per-building bbox grid (separate from
  // the POI cell map used in Pass 1) so we don't iterate every building per
  // POI — important now that way/relation POIs may be in the thousands.
  const snapRadius = 18;
  type BuildingCell = { idx: number; minX: number; maxX: number; minZ: number; maxZ: number };
  const bldgCellMap = new Map<string, BuildingCell[]>();
  const bldgBoxes: BuildingCell[] = [];
  for (let bi = 0; bi < buildings.length; bi++) {
    const fp = buildings[bi].footprint;
    if (fp.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of fp) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const box: BuildingCell = { idx: bi, minX, maxX, minZ, maxZ };
    bldgBoxes.push(box);
    const cx0 = Math.floor((minX - snapRadius) / cellSize);
    const cx1 = Math.floor((maxX + snapRadius) / cellSize);
    const cz0 = Math.floor((minZ - snapRadius) / cellSize);
    const cz1 = Math.floor((maxZ + snapRadius) / cellSize);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const key = `${cx},${cz}`;
        let bucket = bldgCellMap.get(key);
        if (!bucket) { bucket = []; bldgCellMap.set(key, bucket); }
        bucket.push(box);
      }
    }
  }

  // Squared distance from point (px,pz) to segment (ax,az)-(bx,bz)
  const distSqToSeg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
    const dx = bx - ax, dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq === 0) {
      const ddx = px - ax, ddz = pz - az;
      return ddx * ddx + ddz * ddz;
    }
    let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const x = ax + t * dx, z = az + t * dz;
    const ddx = px - x, ddz = pz - z;
    return ddx * ddx + ddz * ddz;
  };

  for (let idx = 0; idx < pois.length; idx++) {
    if (claimed[idx]) continue;
    const tags = extractPOITags(pois[idx].tags);
    if (!tags.length) continue;
    const [px, pz] = poiPositions[idx];

    const pcx = Math.floor(px / cellSize);
    const pcz = Math.floor(pz / cellSize);
    const bucket = bldgCellMap.get(`${pcx},${pcz}`);
    if (!bucket) continue;

    let best: OSMBuilding | null = null;
    let bestDistSq = snapRadius * snapRadius;
    const seenIdx = new Set<number>();
    for (const box of bucket) {
      if (seenIdx.has(box.idx)) continue;
      seenIdx.add(box.idx);
      // Bounding box prefilter (with snapRadius slack already baked in via cell)
      if (px < box.minX - snapRadius || px > box.maxX + snapRadius ||
          pz < box.minZ - snapRadius || pz > box.maxZ + snapRadius) continue;
      const building = buildings[box.idx];
      const fp = building.footprint;
      // Min squared distance from POI to any polygon edge.
      let minDsq = Infinity;
      for (let i = 0; i < fp.length; i++) {
        const [ax, az] = fp[i];
        const [bx, bz] = fp[(i + 1) % fp.length];
        const dsq = distSqToSeg(px, pz, ax, az, bx, bz);
        if (dsq < minDsq) minDsq = dsq;
      }
      if (minDsq < bestDistSq) {
        bestDistSq = minDsq;
        best = building;
      }
    }

    if (best) {
      const allTags = [...best.tags, ...tags];
      const seen = new Set<string>();
      best.tags = allTags.filter(t => {
        const key = t.name && t.name.trim()
          ? `name:${t.name.toLowerCase().trim()}`
          : `tl:${t.category}|${t.label.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      claimed[idx] = 1;
    }
  }
}

/**
 * Post-enrichment building-name verification.
 *
 * The way-level heuristic in parseOverpassData only catches mis-attributed
 * tenant names when the OSM building way *itself* carries shop/amenity tags
 * (e.g. `building=yes; shop=clothes; name=뉴발란스` on a 50-story tower).
 * It misses the common case where the tenant only appears as a separate
 * POI node inside the polygon: OSM mappers slap `name=Lobster Bar` on a
 * skyscraper way after the most visible ground-floor business, leaving the
 * way's own shop/amenity blank, so the heuristic stays silent and the
 * skyscraper inherits the bar's name.
 *
 * This second pass runs after enrichBuildingsWithPOIs has linked POI nodes
 * to building footprints, so it can cross-reference the building's display
 * name against the names of all matched tenant tags. If the building name is
 * identical (case- and diacritic-normalized) to a small-tenant tag — food,
 * entertainment, or narrow shop categories, NOT dept stores / malls /
 * supermarkets which legitimately ARE the building — and the building is
 * structurally large (≥5 floors OR ≥20m), we treat the OSM name as a tenant
 * mis-attribution and fall back to the address. The tenant chip itself is
 * preserved, so the user still sees the brand inside the tag list.
 */
function verifyBuildingNamesAgainstTenants(buildings: OSMBuilding[]): void {
  const SMALL_TENANT_CATS = new Set(['food', 'entertainment']);
  const ANCHOR_SHOP_LABELS = new Set(['dept store', 'mall', 'supermarket']);

  // Structural building keywords across the languages VIBLOC supports.
  // If the OSM name contains any of these tokens, the name is almost
  // certainly the building's own (not a ground-floor tenant), so we
  // protect it from suppression even if a tenant happens to share part
  // of the name. Sourced from common OSM building-name patterns plus
  // KR/JP equivalents (빌딩/타워/会館/ビル/タワー…).
  //
  // Split by script: ASCII keywords are matched as whole words (so
  // "Hallmark" doesn't false-positive on "hall"), while CJK keywords are
  // substring-matched because Korean/Japanese have no word boundary.
  const BUILDING_KEYWORDS_ASCII = [
    'tower', 'towers', 'building', 'bldg', 'plaza', 'hall', 'center', 'centre',
    'mansion', 'residence', 'residences', 'estate', 'complex', 'court',
    'house', 'palace', 'arcade', 'gallery', 'square', 'park',
  ];
  const BUILDING_KEYWORDS_CJK = [
    // Korean
    '빌딩', '타워', '플라자', '센터', '회관', '몰', '타운', '시티',
    // Japanese
    'ビル', 'タワー', 'プラザ', 'センター', '会館', 'ホール', 'スクエア',
    'タウン', 'シティ', 'ハウス', 'マンション', 'レジデンス',
  ];
  const BUILDING_KEYWORDS_ASCII_SET = new Set(BUILDING_KEYWORDS_ASCII);

  // Normalize for cross-script comparison: strip diacritics, collapse
  // punctuation/whitespace, lowercase. So "Lobster Bar" / "lobster-bar" /
  // "LOBSTER  BAR" all collapse to the same key.
  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();

  // Check if a (non-normalized) name contains any structural keyword.
  // ASCII keywords must match a whole token (so "Hallmark" ≠ "hall");
  // CJK keywords use substring match because there's no word boundary
  // in Korean/Japanese.
  const hasBuildingKeyword = (raw: string): boolean => {
    const low = raw.toLowerCase();
    for (const kw of BUILDING_KEYWORDS_CJK) {
      if (low.includes(kw)) return true;
      if (raw.includes(kw)) return true;
    }
    // Token-split the normalized form for ASCII whole-word check.
    const tokens = normalize(raw).split(' ').filter(Boolean);
    for (const tok of tokens) {
      if (BUILDING_KEYWORDS_ASCII_SET.has(tok)) return true;
    }
    return false;
  };

  let fixedByTenant = 0;
  let fixedByBlocklist = 0;
  let protectedCount = 0;
  for (const b of buildings) {
    if (!b.name) continue;
    if (b.name === b.address || b.name === 'Building') continue;

    const isLarge = (b.levels && b.levels >= 5) || (b.height && b.height >= 20);
    if (!isLarge) continue;

    // Whitelist guard: name contains a structural keyword → it's the
    // building's own name, never strip it. Runs first so it short-circuits
    // both the tenant cross-reference and the brand blocklist.
    if (hasBuildingKeyword(b.name)) {
      protectedCount++;
      continue;
    }

    const norm = normalize(b.name);
    if (!norm) continue;

    // Rule A — tenant cross-reference: the building's name matches a
    // small-tenant POI that's been attached to its polygon. Strongest
    // signal because we have ground-truth proximity.
    if (b.tags.length) {
      const matchedTenant = b.tags.find((t) => {
        if (!t.name) return false;
        if (normalize(t.name) !== norm) return false;
        if (SMALL_TENANT_CATS.has(t.category)) return true;
        if (t.category === 'shop') {
          return !ANCHOR_SHOP_LABELS.has((t.label || '').toLowerCase());
        }
        return false;
      });
      if (matchedTenant) {
        b.name = b.address || 'Building';
        fixedByTenant++;
        continue;
      }
    }

    // Rule B — brand blocklist: even if no tenant POI was attached to this
    // polygon, the OSM `name` is a known chain/brand harvested from the
    // wider POI extract. The most common case for our 마천루 issue: a
    // 50-story office tower whose ground-floor New Balance got promoted to
    // the building's `name=*` by an OSM mapper, but the New Balance node
    // itself sits just outside the polygon (or wasn't extracted at all).
    if (BRAND_BLOCKLIST.has(norm)) {
      b.name = b.address || 'Building';
      fixedByBlocklist++;
    }
  }

  const totalFixed = fixedByTenant + fixedByBlocklist;
  if (totalFixed > 0 || protectedCount > 0) {
    console.log(
      `[VIBLOC] verifyBuildingNamesAgainstTenants: corrected ${totalFixed} mis-named ` +
        `(tenant: ${fixedByTenant}, brand blocklist: ${fixedByBlocklist}), ` +
        `protected ${protectedCount} keyword-named`,
    );
  }
}

// --- Wikidata integration: cross-reference verified building data ---

type WikidataItem = {
  id: string;
  name: string;
  description: string;
  lat: number;
  lon: number;
  height: number | null;
  floors: number | null;
  uses: string[];
  occupants: string[];
  type: string;
};

// Wikidata types that are NOT buildings — skip entirely
const WIKI_SKIP_TYPES = new Set([
  'human', 'television series', 'aviation accident', 'river', 'square',
  'historic district', 'cultural heritage', 'event venue', 'historic site',
  'architectural ensemble',
]);

/** Map Wikidata type string to BuildingTag category */
function wikitypeToCategory(type: string): BuildingTag['category'] {
  const t = type.toLowerCase();
  if (t.includes('hotel') || t.includes('hostel') || t.includes('guest house')) return 'hotel';
  if (t.includes('school') || t.includes('university') || t.includes('college') || t.includes('library') || t.includes('education')) return 'education';
  if (t.includes('museum') || t.includes('theatre') || t.includes('theater') || t.includes('cinema') || t.includes('gallery') || t.includes('concert') || t.includes('performing arts') || t.includes('arcade')) return 'entertainment';
  if (t.includes('church') || t.includes('temple') || t.includes('shrine') || t.includes('mosque') || t.includes('cathedral') || t.includes('worship')) return 'religious';
  if (t.includes('hospital') || t.includes('clinic') || t.includes('medical') || t.includes('pharmacy')) return 'medical';
  if (t.includes('fire station') || t.includes('police') || t.includes('government') || t.includes('embassy') || t.includes('consulate') || t.includes('metro station') || t.includes('railway station')) return 'government';
  if (t.includes('shopping') || t.includes('store') || t.includes('mall') || t.includes('retail') || t.includes('market')) return 'shop';
  if (t.includes('restaurant') || t.includes('food') || t.includes('cafe') || t.includes('bakery')) return 'food';
  if (t.includes('residential') || t.includes('apartment') || t.includes('condominium') || t.includes('house')) return 'residential';
  if (t.includes('office') || t.includes('skyscraper') || t.includes('commercial') || t.includes('tower') || t.includes('business')) return 'office';
  return 'other';
}

/** Clean display label from Wikidata type */
function wikiTypeLabel(type: string): string {
  const t = type.toLowerCase().split(',')[0].trim();
  if (t.includes('skyscraper')) return 'Skyscraper';
  if (t.includes('hotel')) return 'Hotel';
  if (t.includes('office building')) return 'Office';
  if (t.includes('commercial')) return 'Commercial';
  if (t.includes('theatre') || t.includes('theater')) return 'Theatre';
  if (t.includes('concert hall')) return 'Concert Hall';
  if (t.includes('performing arts')) return 'Performance';
  if (t.includes('museum')) return 'Museum';
  if (t.includes('library')) return 'Library';
  if (t.includes('school')) return 'Education';
  if (t.includes('cathedral') || t.includes('church')) return 'Church';
  if (t.includes('temple') || t.includes('shrine')) return 'Temple';
  if (t.includes('metro station')) return 'Station';
  if (t.includes('railway station')) return 'Station';
  if (t.includes('shopping')) return 'Shopping';
  if (t.includes('restaurant')) return 'Restaurant';
  if (t.includes('fire station')) return 'Fire Station';
  if (t.includes('tower block')) return 'Tower';
  if (t.includes('building')) return 'Building';
  return type.split(',')[0].trim().charAt(0).toUpperCase() + type.split(',')[0].trim().slice(1);
}

/** Enrich buildings with Wikidata — cross-validated by proximity.
 *  Returns a Map<wikidata Q-id, building> for downstream enrichment lookups. */
function enrichBuildingsWithWikidata(
  buildings: OSMBuilding[],
  wikiItems: WikidataItem[],
  refLat: number,
  refLon: number
): Map<string, OSMBuilding> {
  const idToBuilding = new Map<string, OSMBuilding>();
  if (!wikiItems.length) return idToBuilding;

  // Convert wikidata positions to local meters
  const wikiPositions = wikiItems.map(w => latLonToMeters(w.lat, w.lon, refLat, refLon));

  // ---- Wikidata reliability guard ----
  // Wikidata P625 coordinates are user-edited and frequently wrong. Real-world
  // example: Q863639 (Shinjuku NS Building) lists 35.69333, 139.69319 sourced
  // from Russian Wikipedia, but the actual building polygon is ~570m south.
  // Strategy: only accept a wikidata→building match when the wikidata point
  // either falls inside the polygon or is within a *strict* 30m of its center.
  // Anything beyond that is treated as a stale/wrong P625 and silently dropped
  // (with a console.warn so we can audit which Q-ids need community fixes).
  const STRICT_FALLBACK_M = 30; // already in use; named for clarity
  const REJECT_FAR_M = 200;     // anything past this is almost certainly wrong
  let matched = 0;
  let rejectedFar = 0;
  for (let wi = 0; wi < wikiItems.length; wi++) {
    const item = wikiItems[wi];

    // Skip non-building items
    if (WIKI_SKIP_TYPES.has(item.type)) continue;

    const [wx, wz] = wikiPositions[wi];

    // Try point-in-polygon first (most precise)
    let bestBuilding: OSMBuilding | null = null;
    for (const building of buildings) {
      if (pointInPolygon(wx, wz, building.footprint)) {
        bestBuilding = building;
        break;
      }
    }

    // Fallback: find closest building within STRICT_FALLBACK_M.
    // Also remember the absolute closest (regardless of threshold) so we can
    // flag wildly-wrong P625 entries that *would have* matched something far
    // away — those are the real-world OSM/Wikidata divergences worth logging.
    let absClosest: OSMBuilding | null = null;
    let absClosestDist = Infinity;
    if (!bestBuilding) {
      let bestDist = STRICT_FALLBACK_M;
      for (const building of buildings) {
        const dx = building.center[0] - wx;
        const dz = building.center[1] - wz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < absClosestDist) {
          absClosestDist = dist;
          absClosest = building;
        }
        if (dist < bestDist) {
          bestDist = dist;
          bestBuilding = building;
        }
      }
    }

    if (!bestBuilding) {
      // Audit: if a known wikidata item with a name has *any* building within
      // 200m, the P625 is likely wrong rather than the building being missing.
      if (item.name && absClosest && absClosestDist < REJECT_FAR_M * 5) {
        rejectedFar++;
        // Quiet by default — flip to console.warn locally to surface Q-ids.
      }
      continue;
    }
    matched++;
    if (item.id) {
      idToBuilding.set(item.id, bestBuilding);
      // Persist the Wikidata Q-id on the building so the panel can hit
      // Wikidata's free CORS-enabled REST API at click time for verified
      // multilingual names + descriptions.
      bestBuilding.wikidataId = item.id;
    }

    // Cross-validate and enrich — only use verified info

    // If building has no good name, use Wikidata name
    if (item.name && (bestBuilding.name === 'Building' || !bestBuilding.name)) {
      bestBuilding.name = item.name;
    }

    // Use Wikidata height if building has estimated height and Wiki has actual data
    if (item.height && item.height > 0) {
      // Only override if Wikidata height is reasonable (within 3x of current)
      const ratio = item.height / bestBuilding.height;
      if (ratio > 0.3 && ratio < 3) {
        bestBuilding.height = item.height;
        bestBuilding.levels = item.floors || Math.max(1, Math.floor(item.height / 3.5));
      }
    } else if (item.floors && item.floors > 0 && !bestBuilding.levels) {
      bestBuilding.levels = item.floors;
      bestBuilding.height = item.floors * 3.5;
    }

    // Add type tag from Wikidata
    if (item.type && item.type !== 'building') {
      const cat = wikitypeToCategory(item.type);
      const label = wikiTypeLabel(item.type);
      // Don't add generic 'Building' or 'Other' labels
      if (label !== 'Building' && label !== 'Other' && cat !== 'other') {
        if (!bestBuilding.tags.some(t => t.label.toLowerCase() === label.toLowerCase())) {
          bestBuilding.tags.unshift({ label, category: cat });
        }
      }
    }

    // For business/company type items, the item name IS the company name
    const isBusiness = item.type.toLowerCase().includes('business') || item.type.toLowerCase().includes('company');
    if (isBusiness && item.name) {
      const cat = wikitypeToCategory(item.description || item.type);
      if (!bestBuilding.tags.some(t => t.name === item.name)) {
        bestBuilding.tags.push({ label: 'Office', category: cat === 'other' ? 'office' : cat, name: item.name });
      }
    }

    // For restaurant/hotel/shop type items, add name as tenant
    const isNamedVenue = item.type.toLowerCase().includes('restaurant') ||
      item.type.toLowerCase().includes('hotel') ||
      item.type.toLowerCase().includes('museum') ||
      item.type.toLowerCase().includes('theatre');
    if (isNamedVenue && item.name) {
      const cat = wikitypeToCategory(item.type);
      if (!bestBuilding.tags.some(t => t.name === item.name)) {
        bestBuilding.tags.push({ label: wikiTypeLabel(item.type), category: cat, name: item.name });
      }
    }

    // Add occupant/tenant tags (with names)
    for (const occ of item.occupants) {
      if (occ && !bestBuilding.tags.some(t => t.name === occ)) {
        bestBuilding.tags.push({ label: 'Office', category: 'office', name: occ });
      }
    }

    // Add use tags
    for (const use of item.uses) {
      if (!use) continue;
      const cat = wikitypeToCategory(use);
      const label = use.charAt(0).toUpperCase() + use.slice(1);
      if (!bestBuilding.tags.some(t => t.label.toLowerCase() === label.toLowerCase())) {
        bestBuilding.tags.push({ label, category: cat });
      }
    }
  }

  console.log(
    `[VIBLOC] Wikidata: ${matched}/${wikiItems.length} items matched to buildings` +
    (rejectedFar ? ` (${rejectedFar} dropped — P625 too far from any building)` : '')
  );
  return idToBuilding;
}

// --- Wikipedia enrichment (verified, infobox-extracted) ---

type WikiEnrichedItem = {
  id: string;
  wiki_title?: string;
  wiki_url?: string;
  references_count?: number;
  verified?: boolean;
  current_tenants?: string[];
  former_tenants?: string[];
  tenants?: string[];
  occupants?: string[];
  owner?: string[];
  operator?: string[];
  developer?: string[];
  architect?: string[];
  built?: string;
  height?: string;
  floors?: string;
  style?: string;
  cost?: string;
  /** Verified address lifted from Wikipedia infobox — preferred over OSM addr:* */
  address?: string;
};

/** Heuristic: classify a tenant/occupant string into a category. */
function tenantCategory(name: string): BuildingTag['category'] {
  const n = name.toLowerCase();
  if (/(hotel|inn|hostel|ritz|hyatt|marriott|hilton|sheraton)/.test(n)) return 'hotel';
  if (/(restaurant|café|cafe|bistro|bar |grill|diner|kitchen|sushi|ramen|pizza|bakery|starbucks|mcdonald|burger)/.test(n)) return 'food';
  if (/(store|shop|mart|boutique|outlet|market|mall|apparel|clothing|department)/.test(n)) return 'shop';
  if (/(school|university|college|academy|institute|library)/.test(n)) return 'education';
  if (/(hospital|clinic|medical|pharmacy|health)/.test(n)) return 'medical';
  if (/(museum|theatre|theater|cinema|gallery|club|bar$|lounge)/.test(n)) return 'entertainment';
  if (/(church|temple|shrine|mosque|cathedral|chapel)/.test(n)) return 'religious';
  if (/(embassy|consulate|police|court|government|ministry|department of)/.test(n)) return 'government';
  if (/(apartments?|residences?|condos?|condominium)/.test(n)) return 'residential';
  return 'office';
}

// Stopwords / wikitext parse artifacts that should never show up as tenants
const JUNK_TENANT_NAMES = new Set([
  'or', 'and', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for',
  'n/a', 'na', 'tbd', 'unknown', 'none', 'various', 'multiple', 'other',
  '?', '-', '--', '...', 'etc', 'etc.', 'et al', 'et al.',
  'yes', 'no', 'true', 'false',
  // Korean/Japanese common junk
  '외', '등', '他', 'ほか',
]);

/** Push a named tag onto a building unless an entry with the same name already exists. */
function pushNamedTag(building: OSMBuilding, label: string, name: string, category: BuildingTag['category']) {
  const trimmed = name.trim();
  if (!trimmed) return;
  // Length sanity — tenants should be proper names, 3..80 chars
  if (trimmed.length < 3 || trimmed.length > 80) return;
  // Stopword / junk blacklist (case-insensitive)
  if (JUNK_TENANT_NAMES.has(trimmed.toLowerCase())) return;
  // Must contain at least one letter (reject e.g. "123", "...", "--")
  if (!/[\p{L}]/u.test(trimmed)) return;
  // Must not be just wiki-template leftover like "[[...]]" or "{{...}}"
  if (/[\[\]{}|]/.test(trimmed)) return;
  if (building.tags.some(t => t.name && t.name.toLowerCase() === trimmed.toLowerCase())) return;
  building.tags.push({ label, category, name: trimmed });
}

/** Merge verified Wikipedia infobox data into the buildings already matched via Wikidata. */
function enrichBuildingsWithWikiInfobox(
  idToBuilding: Map<string, OSMBuilding>,
  enriched: WikiEnrichedItem[],
  areaKey?: string
): void {
  if (!enriched.length || !idToBuilding.size) return;
  let updated = 0;
  let tenantsAdded = 0;
  let addressesFixed = 0;

  const suffixInfo = areaKey ? AREA_LOCALITY[areaKey] : undefined;
  const locality = suffixInfo?.locality ?? '';
  const localityFirst = locality.split(',')[0].toLowerCase();

  /** Accept only Wiki addresses that look real and Google-searchable. */
  const looksLikeAddress = (s: string): boolean => {
    if (!s) return false;
    const trimmed = s.trim();
    if (trimmed.length < 6 || trimmed.length > 200) return false;
    // Must contain at least one digit (house number / postcode) OR a Korean/Japanese locality marker
    const hasDigit = /\d/.test(trimmed);
    const hasKRJP = /[동구로가街町丁目区]/.test(trimmed);
    if (!hasDigit && !hasKRJP) return false;
    // Reject pure URLs / wiki leftovers
    if (/\[\[|\]\]|https?:\/\//.test(trimmed)) return false;
    return true;
  };

  for (const item of enriched) {
    if (!item.verified) continue;
    const building = idToBuilding.get(item.id);
    if (!building) continue;
    updated++;

    // Persist Wikipedia article pointer so the panel can fetch a verified
    // summary on demand via the free CORS-enabled REST API.
    if (item.wiki_title) building.wikipediaTitle = item.wiki_title;
    if (item.wiki_url) building.wikipediaUrl = item.wiki_url;

    // --- Verified address override ---
    // Prefer Wikipedia infobox address when it passes sanity checks.
    if (item.address && looksLikeAddress(item.address)) {
      let wikiAddr = item.address.trim();
      // Append locality suffix if missing, so Google maps it correctly
      if (locality && localityFirst && !wikiAddr.toLowerCase().includes(localityFirst)) {
        // Try to avoid double-appending a city name already present in another form
        wikiAddr = `${wikiAddr}, ${locality}`;
      }
      // Only overwrite if new address is clearly more informative
      const currentLen = (building.address || '').length;
      if (!building.address || wikiAddr.length > currentLen + 4 || !/\d/.test(building.address)) {
        building.address = wikiAddr;
        addressesFixed++;
      }
    }

    // Tenants — most valuable signal
    const allTenants = [
      ...(item.current_tenants || []),
      ...(item.tenants || []),
      ...(item.occupants || []),
    ];
    for (const t of allTenants) {
      const cat = tenantCategory(t);
      const labelMap: Record<BuildingTag['category'], string> = {
        office: 'Office', hotel: 'Hotel', food: 'Restaurant', shop: 'Shop',
        residential: 'Residence', entertainment: 'Venue', religious: 'Religious',
        education: 'Education', medical: 'Medical', government: 'Government', other: 'Tenant',
      };
      pushNamedTag(building, labelMap[cat], t, cat);
      tenantsAdded++;
    }

    // Owner / operator / developer / architect — list under Office category as named entries
    for (const o of item.owner || []) pushNamedTag(building, 'Owner', o, 'office');
    for (const o of item.operator || []) pushNamedTag(building, 'Operator', o, 'office');
    for (const o of item.developer || []) pushNamedTag(building, 'Developer', o, 'office');
    for (const o of item.architect || []) pushNamedTag(building, 'Architect', o, 'office');

    // Use floors from Wikipedia if building still has no real floor data
    if (item.floors && (!building.levels || building.levels < 2)) {
      const f = parseInt(item.floors.replace(/[^0-9]/g, ''), 10);
      if (f > 0 && f < 200) {
        building.levels = f;
        if (!building.height || building.height < f * 2) building.height = f * 3.5;
      }
    }
  }

  console.log(`[VIBLOC] Wiki infobox: enriched ${updated} buildings (+${tenantsAdded} tenants, ${addressesFixed} addresses verified)`);
}

/** Infer a tag for buildings that have none — based on size, height, and context */
function inferBuildingTags(buildings: OSMBuilding[]): void {
  // Build density map: count POI-tagged buildings per grid cell to detect commercial zones
  const zoneSize = 100; // 100m grid
  const commercialZones = new Map<string, number>();
  for (const b of buildings) {
    if (b.tags.length > 0) {
      const key = `${Math.floor(b.center[0] / zoneSize)},${Math.floor(b.center[1] / zoneSize)}`;
      commercialZones.set(key, (commercialZones.get(key) || 0) + 1);
    }
  }

  let inferred = 0;
  for (const b of buildings) {
    if (b.tags.length > 0) continue; // already has tags

    // Calculate footprint area
    let area = 0;
    for (let i = 0; i < b.footprint.length; i++) {
      const j = (i + 1) % b.footprint.length;
      area += b.footprint[i][0] * b.footprint[j][1] - b.footprint[j][0] * b.footprint[i][1];
    }
    area = Math.abs(area) / 2;

    // Check if in a dense commercial zone
    const zoneKey = `${Math.floor(b.center[0] / zoneSize)},${Math.floor(b.center[1] / zoneSize)}`;
    const zoneDensity = commercialZones.get(zoneKey) || 0;
    const isCommercialZone = zoneDensity >= 3;

    // Infer based on size + height + zone
    if (b.height >= 60 || b.levels >= 15) {
      // Tall building → Office/Commercial
      b.tags.push({ label: 'Office', category: 'office' });
    } else if (b.height >= 30 || b.levels >= 8) {
      // Mid-rise
      if (isCommercialZone) {
        b.tags.push({ label: 'Commercial', category: 'office' });
      } else {
        b.tags.push({ label: 'Residential', category: 'residential' });
      }
    } else if (area > 500) {
      // Large footprint, low-rise → likely commercial/retail
      b.tags.push({ label: 'Commercial', category: 'office' });
    } else if (area > 150 && isCommercialZone) {
      // Medium building in commercial zone
      b.tags.push({ label: 'Commercial', category: 'office' });
    } else {
      // Small building → Residential
      b.tags.push({ label: 'Residential', category: 'residential' });
    }
    inferred++;
  }

  console.log(`[VIBLOC] Inferred tags for ${inferred} buildings without data`);
}

/**
 * Extract apartment complex names from named apartment buildings and
 * propagate them to sibling buildings that are missing a name.
 *
 * Typical patterns in OSM (all supported):
 *   "래미안강남포레스트 101동"     → 래미안강남포레스트
 *   "타워팰리스 1차"               → 타워팰리스
 *   "Park Avenue Tower 3"          → Park Avenue
 *   "Sunset Towers Bldg B"         → Sunset Towers
 *   "グランドメゾン 3号棟"          → グランドメゾン
 */
function stripApartmentUnitSuffix(name: string): string {
  return name
    // Korean: 101동, A동, 1차, 제1동, 아파트 101동
    .replace(/\s*제?\s*\d+\s*동\s*$/u, '')
    .replace(/\s*[A-Z]\s*동\s*$/u, '')
    .replace(/\s*\d+\s*차\s*$/u, '')
    // Japanese: 3号棟, 第3号棟, 3号
    .replace(/\s*第?\s*\d+\s*号?棟?\s*$/u, '')
    // English: Building 5, Bldg B, Block 3, Tower 2, #102
    .replace(/[\s,-]+(Bldg|Building|Block|Tower|Ph|Phase)[\s.]*[A-Z0-9]+\s*$/i, '')
    .replace(/\s+#\s*\d+\s*$/u, '')
    // Trailing standalone number like "Sunset 5"
    .replace(/\s+\d+\s*$/u, '')
    .trim();
}

function inferApartmentComplexNames(buildings: OSMBuilding[]): void {
  const isApartment = (b: OSMBuilding) =>
    b.tags.some((t) => t.category === 'residential');
  const hasRealName = (b: OSMBuilding) =>
    b.name && b.name !== 'Building' && b.name !== b.address;

  type Cluster = {
    name: string;
    cx: number;
    cz: number;
    count: number;
    maxR: number;
  };
  const clusters = new Map<string, Cluster>();

  // Pass 1: build clusters keyed by stripped complex name
  for (const b of buildings) {
    if (!isApartment(b) || !hasRealName(b)) continue;
    const stripped = stripApartmentUnitSuffix(b.name);
    if (!stripped || stripped.length < 2) continue;
    // We require the stripped name to be meaningfully shorter OR to be used by
    // ≥2 siblings — so single-building apartments don't hijack the cluster map.
    const c = clusters.get(stripped);
    if (c) {
      const n = c.count;
      c.cx = (c.cx * n + b.center[0]) / (n + 1);
      c.cz = (c.cz * n + b.center[1]) / (n + 1);
      c.count = n + 1;
      const d = Math.hypot(b.center[0] - c.cx, b.center[1] - c.cz);
      if (d > c.maxR) c.maxR = d;
    } else {
      clusters.set(stripped, {
        name: stripped,
        cx: b.center[0],
        cz: b.center[1],
        count: 1,
        maxR: 0,
      });
    }
  }

  // Pass 2: replace "101동" style titles with the clean complex name,
  // for buildings whose stripped name already matches a multi-building cluster.
  let renamed = 0;
  for (const b of buildings) {
    if (!isApartment(b) || !hasRealName(b)) continue;
    const stripped = stripApartmentUnitSuffix(b.name);
    if (stripped === b.name) continue;
    const c = clusters.get(stripped);
    if (c && c.count >= 2) {
      b.name = stripped;
      renamed++;
    }
  }

  // Pass 3: propagate complex name to unnamed apartments nearby
  let propagated = 0;
  for (const c of clusters.values()) {
    if (c.count < 2) continue;
    const radius = Math.max(c.maxR + 80, 160); // generous search radius
    for (const b of buildings) {
      if (!isApartment(b)) continue;
      if (hasRealName(b)) continue;
      const d = Math.hypot(b.center[0] - c.cx, b.center[1] - c.cz);
      if (d <= radius) {
        b.name = c.name;
        // Also record as a named residential tenant so it shows up in the card.
        if (!b.tags.some((t) => t.name === c.name)) {
          b.tags.unshift({ label: 'Apartments', category: 'residential', name: c.name });
        }
        propagated++;
      }
    }
  }

  if (renamed || propagated) {
    console.log(
      `[VIBLOC] Apartment complex: ${renamed} titles normalized, ${propagated} unnamed siblings inherited complex name`
    );
  }
}

/** Final tag cleanup: deduplicate, prioritize named tags, limit count */
function cleanupTags(buildings: OSMBuilding[]): void {
  const MAX_TAGS = 20;
  for (const b of buildings) {
    if (!b.tags.length) continue;

    // Deduplicate: same name = same entry, same label without name = same entry
    const seen = new Set<string>();
    b.tags = b.tags.filter(t => {
      const key = t.name && t.name.trim()
        ? `n:${t.name.toLowerCase().trim()}`
        : `l:${t.category}|${t.label.toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort: named tags first (most informative), then unnamed type tags.
    // Within named, prioritize tenant-like categories over architects/owners.
    const priority = (t: BuildingTag): number => {
      const hasName = !!(t.name && t.name.trim());
      if (!hasName) return 100; // generic type tags last
      // Named: rank by usefulness — visible storefronts first
      const cat = t.category;
      if (cat === 'food' || cat === 'shop' || cat === 'hotel' || cat === 'entertainment') return 0;
      if (cat === 'medical' || cat === 'education' || cat === 'religious') return 5;
      if (cat === 'government') return 10;
      // Office: tenants > owner/operator > developer/architect
      const lab = t.label.toLowerCase();
      if (lab === 'architect' || lab === 'developer') return 30;
      if (lab === 'owner' || lab === 'operator') return 20;
      return 15; // generic office tenants
    };
    b.tags.sort((a, c) => priority(a) - priority(c));

    if (b.tags.length > MAX_TAGS) {
      b.tags = b.tags.slice(0, MAX_TAGS);
    }
  }
}

export async function fetchOSMBuildings(area: CityAreaKey): Promise<OSMBuilding[]> {
  const config = CITY_AREAS[area];
  const res = await fetch(config.file);
  const data = await res.json();
  const buildings = parseOverpassData(data.elements, config.refLat, config.refLon, area);

  // 1. Load POI data and enrich buildings
  try {
    const poiFile = config.file.replace('.json', '_pois.json');
    const poiRes = await fetch(poiFile);
    if (poiRes.ok) {
      const poiData = await poiRes.json();
      const pois = parsePOINodes(poiData.elements || []);
      console.log(`[VIBLOC] ${area}: ${pois.length} POIs loaded, matching to ${buildings.length} buildings...`);
      enrichBuildingsWithPOIs(buildings, pois, config.refLat, config.refLon);
      const enriched = buildings.filter(b => b.tags.length > 0).length;
      console.log(`[VIBLOC] ${area}: ${enriched} buildings have tags after POI enrichment`);
      // Cross-reference building display names against attached tenant POIs
      // and strip mis-attributed names from large buildings.
      verifyBuildingNamesAgainstTenants(buildings);
    }
  } catch (e) {
    console.warn(`[VIBLOC] Could not load POI data for ${area}:`, e);
  }

  // 2. Load Wikidata and cross-reference (verified data only)
  let wikiIdMap: Map<string, OSMBuilding> = new Map();
  try {
    const wikiFile = config.file.replace('.json', '_wikidata.json');
    const wikiRes = await fetch(wikiFile);
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      const items: WikidataItem[] = (wikiData.items || []).filter(
        (w: WikidataItem) => w.lat && w.lon && w.name && !WIKI_SKIP_TYPES.has(w.type)
      );
      console.log(`[VIBLOC] ${area}: ${items.length} Wikidata items loaded`);
      wikiIdMap = enrichBuildingsWithWikidata(buildings, items, config.refLat, config.refLon);
    }
  } catch (e) {
    console.warn(`[VIBLOC] Could not load Wikidata for ${area}:`, e);
  }

  // 3. Load Wikipedia infobox enrichment (verified tenants, owner, architect, ...)
  try {
    const enrichFile = config.file.replace('.json', '_wiki_enriched.json');
    const enrichRes = await fetch(enrichFile);
    if (enrichRes.ok) {
      const enrichData = await enrichRes.json();
      const items: WikiEnrichedItem[] = enrichData.items || [];
      console.log(`[VIBLOC] ${area}: ${items.length} Wikipedia-enriched items loaded`);
      enrichBuildingsWithWikiInfobox(wikiIdMap, items, area);
    }
  } catch (e) {
    console.warn(`[VIBLOC] Could not load Wikipedia enrichment for ${area}:`, e);
  }

  // 3a. Fuse community-verified address points from /data/addr_points.json.
  //     Source: OSM Overpass nodes with addr:housenumber + addr:street.
  //     These are explicit community contributions independent of building
  //     polygons; if one falls within ~25 m of a building's footprint center
  //     we treat it as a more-trusted address than borrowed/locality fallbacks.
  //     Manual Google-verified overrides (3b) still win the final word.
  try {
    const addrRes = await fetch('/data/addr_points.json');
    if (addrRes.ok) {
      const addrData = await addrRes.json();
      const points: { address: string; lat: number; lng: number }[] =
        (addrData.cities && addrData.cities[area]) || [];
      if (points.length > 0) {
        // Project addr points into the same local meters as building.center.
        const cosLat = Math.cos((config.refLat * Math.PI) / 180);
        type Pt = { x: number; z: number; address: string };
        const projected: Pt[] = points.map((p) => ({
          x: (p.lng - config.refLon) * 111320 * cosLat,
          z: (p.lat - config.refLat) * 110540,
          address: p.address,
        }));
        // Build a 50 m grid for fast nearest lookup.
        const CELL = 50;
        const grid = new Map<string, Pt[]>();
        const cellKey = (cx: number, cz: number) => `${cx},${cz}`;
        for (const pt of projected) {
          const cx = Math.floor(pt.x / CELL);
          const cz = Math.floor(pt.z / CELL);
          const k = cellKey(cx, cz);
          let bucket = grid.get(k);
          if (!bucket) {
            bucket = [];
            grid.set(k, bucket);
          }
          bucket.push(pt);
        }
        const MAX_M = 25;
        const MAX_M_SQ = MAX_M * MAX_M;
        let fused = 0;
        for (const b of buildings) {
          const bx = b.center[0];
          const bz = b.center[1];
          const cx = Math.floor(bx / CELL);
          const cz = Math.floor(bz / CELL);
          let bestD = Infinity;
          let bestAddr: string | null = null;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              const bucket = grid.get(cellKey(cx + dx, cz + dz));
              if (!bucket) continue;
              for (const pt of bucket) {
                const ddx = pt.x - bx;
                const ddz = pt.z - bz;
                const d = ddx * ddx + ddz * ddz;
                if (d < bestD && d <= MAX_M_SQ) {
                  bestD = d;
                  bestAddr = pt.address;
                }
              }
            }
          }
          if (bestAddr && bestAddr !== b.address) {
            // Prefer the verified addr point unless the existing address is
            // already authoritative AND the new one is just a generic match.
            // To be conservative, only replace when (a) building has no
            // authoritative address, OR (b) the new point is very close (<8m).
            if (!b.addressOriginal || bestD <= 64) {
              b.address = bestAddr;
              b.addressOriginal = true;
              fused++;
            }
          }
        }
        if (fused > 0) {
          console.log(`[VIBLOC] ${area}: ${fused} addresses fused from OSM addr-point nodes`);
        }
      }
    }
  } catch (e) {
    console.warn(`[VIBLOC] Could not load addr_points for ${area}:`, e);
  }

  // 3b. Apply manual Google-Maps-verified address overrides (single shared file).
  //     These always win because they're hand-checked against google.com/maps.
  try {
    const overrideRes = await fetch('/data/address_overrides.json');
    if (overrideRes.ok) {
      const overrideData = await overrideRes.json();
      const overrides: Record<string, string> = overrideData.overrides || {};
      let count = 0;
      for (const b of buildings) {
        const key = b.id.startsWith('osm-') ? b.id.slice(4) : b.id;
        const v = overrides[key];
        if (typeof v === 'string' && v.length > 5 && !v.startsWith('_')) {
          b.address = v;
          b.addressOriginal = true;
          count++;
        }
      }
      if (count > 0) console.log(`[VIBLOC] ${area}: ${count} addresses set from manual overrides`);
    }
  } catch (e) {
    console.warn(`[VIBLOC] Could not load address overrides:`, e);
  }

  // 4. Infer tags for buildings with no data
  inferBuildingTags(buildings);

  // 4b. Apartment complex name inference — strip "101동" suffixes from
  //     named apartments and propagate complex name to unnamed siblings.
  inferApartmentComplexNames(buildings);

  // 5. Final cleanup — deduplicate, limit tags
  cleanupTags(buildings);

  return buildings;
}

// --- Terrain types ---

export type OSMRoad = {
  width: number;
  type: string;
  points: [number, number][];
  name: string;
  isTunnel: boolean;
  isBridge: boolean;
  layer: number;
};

export type OSMArea = {
  type: 'park' | 'water' | 'commercial' | 'residential' | 'parking' | 'school' | 'playground' | 'railway' | 'construction' | 'pedestrian' | 'platform';
  polygon: [number, number][];
  name: string;
};

export type OSMSteps = {
  points: [number, number][];
  width: number;
};

export type OSMBridge = {
  points: [number, number][];
  width: number;
  type: string; // highway type
};

export type OSMRailway = {
  points: [number, number][];
  type: string;
};

export type OSMWaterway = {
  points: [number, number][];
  type: string; // river, stream, canal, ditch
  name: string;
  width: number;
};

const ROAD_WIDTHS: Record<string, number> = {
  motorway: 14,
  motorway_link: 8,
  trunk: 12,
  trunk_link: 7,
  primary: 10,
  primary_link: 6,
  secondary: 8,
  secondary_link: 5,
  tertiary: 6,
  tertiary_link: 4,
  residential: 5,
  service: 3,
  footway: 1.8,
  pedestrian: 4,
  cycleway: 2,
  path: 1.5,
  steps: 2,
  unclassified: 4,
  corridor: 2,
};

const WATERWAY_WIDTHS: Record<string, number> = {
  river: 12,
  canal: 8,
  stream: 4,
  ditch: 2,
  drain: 2,
};

function parseTerrainData(
  elements: OverpassElement[],
  refLat: number,
  refLon: number
): { roads: OSMRoad[]; areas: OSMArea[]; railways: OSMRailway[]; waterways: OSMWaterway[]; steps: OSMSteps[]; bridges: OSMBridge[] } {
  const nodes = new Map<number, { lat: number; lon: number }>();
  for (const el of elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const roads: OSMRoad[] = [];
  const areas: OSMArea[] = [];
  const railways: OSMRailway[] = [];
  const waterways: OSMWaterway[] = [];
  const steps: OSMSteps[] = [];
  const bridges: OSMBridge[] = [];

  for (const el of elements) {
    if (el.type !== 'way' || !el.tags || !el.nodes) continue;

    const pts: [number, number][] = [];
    for (const nodeId of el.nodes) {
      const node = nodes.get(nodeId);
      if (!node) continue;
      pts.push(latLonToMeters(node.lat, node.lon, refLat, refLon));
    }
    if (pts.length < 2) continue;

    const tags = el.tags;
    const name = tags.name || tags['name:en'] || '';

    // Skip underground/indoor features for cleaner surface rendering
    if (tags.indoor === 'yes' || tags.tunnel === 'building_passage') continue;
    const layer = parseInt(tags.layer || '0') || 0;
    if (layer < -1) continue; // skip deep underground

    // Railway platforms (area)
    if (tags.railway === 'platform' || tags.public_transport === 'platform') {
      if (pts.length >= 3) areas.push({ type: 'platform', polygon: pts, name });
      continue;
    }

    // Railways
    if (tags.railway && ['rail', 'subway', 'light_rail', 'monorail'].includes(tags.railway)) {
      railways.push({ points: pts, type: tags.railway });
      continue;
    }

    // Waterways (linear: rivers, streams, canals)
    if (tags.waterway && ['river', 'canal', 'stream', 'ditch', 'drain'].includes(tags.waterway)) {
      waterways.push({ points: pts, type: tags.waterway, name, width: WATERWAY_WIDTHS[tags.waterway] || 4 });
      if (pts.length >= 3) areas.push({ type: 'water', polygon: pts, name });
      continue;
    }

    // Steps/stairs (prominent terrain feature)
    if (tags.highway === 'steps') {
      if (tags.tunnel !== 'yes') {
        steps.push({ points: pts, width: 3 });
      }
      continue;
    }

    // Bridges (elevated surface crossings)
    if (tags.bridge === 'yes' || tags.bridge === 'viaduct') {
      if (tags.highway) {
        bridges.push({ points: pts, width: ROAD_WIDTHS[tags.highway] || 6, type: tags.highway });
      }
      continue;
    }

    // Skip tunnels from surface rendering
    if (tags.tunnel === 'yes') continue;

    // Pedestrian areas / plazas
    if (tags.highway === 'pedestrian' && pts.length >= 3) {
      areas.push({ type: 'pedestrian', polygon: pts, name });
      continue;
    }

    // Roads (skip corridor, elevator)
    if (tags.highway && !['corridor', 'elevator', 'proposed'].includes(tags.highway)) {
      roads.push({
        width: ROAD_WIDTHS[tags.highway] || 3,
        type: tags.highway,
        points: pts,
        name,
        isTunnel: false,
        isBridge: false,
        layer,
      });
      continue;
    }

    // Areas (need closed polygon)
    if (pts.length < 3) continue;

    if (tags.leisure === 'park' || tags.landuse === 'grass' || tags.landuse === 'meadow' || tags.leisure === 'garden' || tags.landuse === 'forest') {
      areas.push({ type: 'park', polygon: pts, name });
    } else if (tags.leisure === 'playground' || tags.leisure === 'pitch' || tags.leisure === 'sports_centre') {
      areas.push({ type: 'playground', polygon: pts, name });
    } else if (tags.natural === 'water' || tags.water) {
      areas.push({ type: 'water', polygon: pts, name });
    } else if (tags.landuse === 'commercial' || tags.landuse === 'retail') {
      areas.push({ type: 'commercial', polygon: pts, name });
    } else if (tags.landuse === 'residential') {
      areas.push({ type: 'residential', polygon: pts, name });
    } else if (tags.amenity === 'parking') {
      areas.push({ type: 'parking', polygon: pts, name });
    } else if (tags.amenity === 'school' || tags.amenity === 'university' || tags.amenity === 'college') {
      areas.push({ type: 'school', polygon: pts, name });
    } else if (tags.landuse === 'cemetery' || tags.landuse === 'recreation_ground') {
      areas.push({ type: 'park', polygon: pts, name });
    } else if (tags.landuse === 'railway' || tags.landuse === 'industrial') {
      areas.push({ type: 'railway', polygon: pts, name });
    } else if (tags.landuse === 'construction') {
      areas.push({ type: 'construction', polygon: pts, name });
    }
  }

  return { roads, areas, railways, waterways, steps, bridges };
}

export async function fetchOSMTerrain(
  area: CityAreaKey
): Promise<{ roads: OSMRoad[]; areas: OSMArea[]; railways: OSMRailway[]; waterways: OSMWaterway[]; steps: OSMSteps[]; bridges: OSMBridge[] }> {
  const config = CITY_AREAS[area];
  const terrainFile = config.file.replace('.json', '_terrain.json');
  const res = await fetch(terrainFile);
  if (!res.ok) throw new Error(`No terrain data for ${area}`);
  const data = await res.json();
  return parseTerrainData(data.elements, config.refLat, config.refLon);
}

// --- District types ---

export type OSMDistrict = {
  name: string;
  nameEn: string;
  position: [number, number]; // local meters [x, z]
};

function parseDistrictData(
  elements: OverpassElement[],
  refLat: number,
  refLon: number
): OSMDistrict[] {
  const districts: OSMDistrict[] = [];

  for (const el of elements) {
    if (el.type !== 'node' || !el.tags?.name || el.lat === undefined || el.lon === undefined) continue;
    const place = el.tags.place;
    if (!place || !['quarter', 'neighbourhood', 'suburb'].includes(place)) continue;

    const [x, z] = latLonToMeters(el.lat, el.lon, refLat, refLon);
    districts.push({
      name: el.tags.name,
      nameEn: el.tags['name:en'] || el.tags['name:ja-Latn'] || el.tags['name:ko-Latn'] || '',
      position: [x, z],
    });
  }

  return districts;
}

export async function fetchOSMDistricts(area: CityAreaKey): Promise<OSMDistrict[]> {
  const config = CITY_AREAS[area];
  const districtFile = config.file.replace('.json', '_districts.json');
  const res = await fetch(districtFile);
  if (!res.ok) return [];
  const data = await res.json();
  return parseDistrictData(data.elements, config.refLat, config.refLon);
}

// --- Elevation data ---

export type ElevationGrid = {
  grid: number; // grid size (e.g. 20 = 20x20)
  south: number;
  west: number;
  north: number;
  east: number;
  elevations: number[]; // row-major, south to north
  minElevation: number;
  maxElevation: number;
  refLat: number;
  refLon: number;
};

export async function fetchElevation(area: CityAreaKey): Promise<ElevationGrid | null> {
  const config = CITY_AREAS[area];
  const elevFile = config.file.replace('.json', '_elevation.json');
  const res = await fetch(elevFile);
  if (!res.ok) return null;
  const data = await res.json();
  return { ...data, refLat: config.refLat, refLon: config.refLon };
}

// Get elevation at a local meter position [x, z] by bilinear interpolation
export function getElevationAt(
  x: number,
  z: number,
  elev: ElevationGrid
): number {
  const { grid, south, west, north, east, elevations, minElevation, refLat, refLon } = elev;

  // Convert local meters back to lat/lon (matches latLonToMeters: north = +Z).
  const lon = x / (111320 * Math.cos((refLat * Math.PI) / 180)) + refLon;
  const lat = z / 110540 + refLat;

  // Grid coords (fractional)
  const gx = ((lon - west) / (east - west)) * (grid - 1);
  const gy = ((lat - south) / (north - south)) * (grid - 1);

  const x0 = Math.max(0, Math.min(grid - 2, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(grid - 2, Math.floor(gy)));
  const fx = gx - x0;
  const fy = gy - y0;

  // Bilinear interpolation
  const e00 = elevations[y0 * grid + x0];
  const e10 = elevations[y0 * grid + x0 + 1];
  const e01 = elevations[(y0 + 1) * grid + x0];
  const e11 = elevations[(y0 + 1) * grid + x0 + 1];

  const e = e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy;

  // Return relative to minimum elevation so ground starts near 0
  return e - minElevation;
}
