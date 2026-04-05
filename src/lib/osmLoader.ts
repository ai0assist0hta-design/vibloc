export type OSMBuilding = {
  id: string;
  name: string;
  height: number;
  levels: number;
  footprint: [number, number][];
  center: [number, number];
};

type OverpassElement = {
  type: string;
  id: number;
  nodes?: number[];
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
};

function latLonToMeters(
  lat: number,
  lon: number,
  refLat: number,
  refLon: number
): [number, number] {
  const x = (lon - refLon) * 111320 * Math.cos((refLat * Math.PI) / 180);
  const z = -(lat - refLat) * 110540;
  return [x, z];
}

function parseOverpassData(
  elements: OverpassElement[],
  refLat: number,
  refLon: number
): OSMBuilding[] {
  const nodes = new Map<number, { lat: number; lon: number }>();
  for (const el of elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const buildings: OSMBuilding[] = [];

  for (const el of elements) {
    if (el.type !== 'way' || !el.tags?.building || !el.nodes) continue;

    const footprint: [number, number][] = [];
    for (const nodeId of el.nodes) {
      const node = nodes.get(nodeId);
      if (!node) continue;
      footprint.push(latLonToMeters(node.lat, node.lon, refLat, refLon));
    }
    if (footprint.length < 3) continue;

    let height = 10;
    if (el.tags.height) {
      height = parseFloat(el.tags.height) || 10;
    } else if (el.tags['building:levels']) {
      height = (parseInt(el.tags['building:levels']) || 3) * 3.5;
    }

    let cx = 0, cz = 0;
    for (const [x, z] of footprint) { cx += x; cz += z; }
    cx /= footprint.length;
    cz /= footprint.length;

    buildings.push({
      id: `osm-${el.id}`,
      name: el.tags.name || el.tags['name:en'] || 'Building',
      height,
      levels: parseInt(el.tags['building:levels'] || '') || Math.max(1, Math.floor(height / 3.5)),
      footprint,
      center: [cx, cz],
    });
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

export async function fetchOSMBuildings(area: CityAreaKey): Promise<OSMBuilding[]> {
  const config = CITY_AREAS[area];
  const res = await fetch(config.file);
  const data = await res.json();
  return parseOverpassData(data.elements, config.refLat, config.refLon);
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

  // Convert local meters back to lat/lon
  const lon = x / (111320 * Math.cos((refLat * Math.PI) / 180)) + refLon;
  const lat = -z / 110540 + refLat;

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
