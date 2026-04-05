import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Shape,
  ExtrudeGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Vector2,
  CanvasTexture,
  RepeatWrapping,
  NearestFilter,
  PlaneGeometry,
  Object3D,
  Matrix4,
  SphereGeometry,
  MeshBasicMaterial,
  InstancedMesh,
  Color,
} from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  fetchOSMBuildings,
  fetchOSMTerrain,
  fetchOSMDistricts,
  fetchElevation,
  getElevationAt,
  type OSMBuilding,
  type OSMArea,
  type OSMRailway,
  type OSMWaterway,
  type OSMSteps,
  type OSMBridge,
  type OSMDistrict,
  type ElevationGrid,
  type CityAreaKey,
} from '../../lib/osmLoader';

// --- Building facade normal map: clean geometric grid ---
function createFacadeNormalMap(): CanvasTexture {
  const cellW = 8, cellH = 12;
  const lineW = 2, lineH = 3;
  const tileW = cellW + lineW, tileH = cellH + lineH;
  const w = tileW * 4, h = tileH * 4;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const d = 50;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const lx = px % tileW, ly = py % tileH;
      const isGridLineX = lx < lineW;
      const isGridLineY = ly < lineH;
      let nx = 128, ny = 128, nz = 255;
      if (isGridLineX || isGridLineY) {
        // Grid lines: flat neutral (mullion/spandrel)
        nz = 255;
      } else {
        // Recessed panel
        const cx = lx - lineW, cy = ly - lineH;
        const pw = cellW, ph = cellH;
        // Edge normals for inset effect
        if (cx === 0) { nx = 128 + d; nz = 210; }
        else if (cx === pw - 1) { nx = 128 - d; nz = 210; }
        if (cy === 0) { ny = 128 + d; nz = 210; }
        else if (cy === ph - 1) { ny = 128 - d; nz = 210; }
        // Inner panel slightly recessed
        if (cx > 0 && cx < pw - 1 && cy > 0 && cy < ph - 1) nz = 240;
      }
      ctx.fillStyle = `rgb(${nx},${ny},${nz})`;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = NearestFilter;
  return tex;
}

// --- Ground grid texture: subtle architectural grid ---
function createGroundGridMap(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Pure white base
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, size, size);
  // Very subtle grid lines
  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 0.5;
  const step = 16;
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }
  // Slightly visible major grid
  ctx.strokeStyle = '#eaeaea';
  ctx.lineWidth = 1;
  const major = step * 4;
  for (let i = 0; i <= size; i += major) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  return tex;
}

let _facadeNorm: CanvasTexture | null = null;
const getFacadeNorm = () => (_facadeNorm ??= createFacadeNormalMap());
let _groundGrid: CanvasTexture | null = null;
const getGroundGrid = () => (_groundGrid ??= createGroundGridMap());


// --- Shared height map: ground mesh vertex heights cached for exact building alignment ---
const GROUND_SIZE = 3200;
const GROUND_SEGS = 200;
const GROUND_CELL = GROUND_SIZE / GROUND_SEGS; // 15m
const GROUND_HALF = GROUND_SIZE / 2; // 1200

type HeightMap = {
  heights: Float32Array; // (GROUND_SEGS+1)^2 values
};

// Flatten threshold: if elevation range < this, terrain is flat (y=0)
// If range is large (e.g. Itaewon), apply gentle stepped terrain
const FLAT_THRESHOLD = 25; // meters — below this, flatten completely
const STEP_HEIGHT = 2; // each terrace step height in meters

function buildHeightMap(elev: ElevationGrid): HeightMap {
  const n = GROUND_SEGS + 1;
  const heights = new Float32Array(n * n);
  const range = elev.maxElevation - elev.minElevation;

  if (range < FLAT_THRESHOLD) {
    // Nearly flat city (Shinjuku, Shibuya, Gangnam) → completely flat at y=0
    heights.fill(0);
  } else {
    // Hilly city (Itaewon) → gentle stepped terrain
    // Scale down dramatically and quantize to small steps
    const scale = 0.12; // compress 83m range → ~10m visual range
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const x = -GROUND_HALF + col * GROUND_CELL;
        const z = GROUND_HALF - row * GROUND_CELL;
        const rawH = getElevationAt(x, z, elev);
        // Quantize to steps
        const stepped = Math.round((rawH * scale) / STEP_HEIGHT) * STEP_HEIGHT;
        heights[row * n + col] = stepped;
      }
    }
  }
  return { heights };
}

// Sample ground height matching the ground mesh exactly
function groundHeightAt(x: number, z: number, hm: HeightMap): number {
  const n = GROUND_SEGS + 1;
  // Map world coords to grid indices (matching buildHeightMap)
  const fx = (x + GROUND_HALF) / GROUND_CELL;        // col direction
  const fz = (GROUND_HALF - z) / GROUND_CELL;         // row direction (Z inverted)
  const ix = Math.max(0, Math.min(GROUND_SEGS - 1, Math.floor(fx)));
  const iz = Math.max(0, Math.min(GROUND_SEGS - 1, Math.floor(fz)));
  const tx = fx - ix;
  const tz = fz - iz;

  const h00 = hm.heights[iz * n + ix];
  const h10 = hm.heights[iz * n + ix + 1];
  const h01 = hm.heights[(iz + 1) * n + ix];
  const h11 = hm.heights[(iz + 1) * n + ix + 1];

  return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
}

// --- MERGED buildings ---
function MergedBuildings({ buildings, hm }: { buildings: OSMBuilding[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    if (buildings.length === 0) return null;
    const geos: BufferGeometry[] = [];

    for (const building of buildings) {
      const fp = building.footprint;
      if (fp.length < 3) continue;
      try {
        const shape = new Shape();
        shape.moveTo(fp[0][0], fp[0][1]);
        for (let i = 1; i < fp.length; i++) shape.lineTo(fp[i][0], fp[i][1]);
        shape.closePath();

        if (hm) {
          const [cx, cz] = building.center;
          let minH = groundHeightAt(cx, cz, hm);
          let maxH = minH;
          for (const [x, z] of fp) {
            const h = groundHeightAt(x, z, hm);
            if (h < minH) minH = h;
            if (h > maxH) maxH = h;
          }
          for (let i = 0; i < fp.length; i++) {
            const ni = (i + 1) % fp.length;
            const h = groundHeightAt((fp[i][0] + fp[ni][0]) / 2, (fp[i][1] + fp[ni][1]) / 2, hm);
            if (h < minH) minH = h;
            if (h > maxH) maxH = h;
          }
          const localSpan = maxH - minH;
          const foundation = 3;
          const yBase = minH - foundation;
          const totalHeight = building.height + localSpan + foundation;

          const geo = new ExtrudeGeometry(shape, { depth: totalHeight, bevelEnabled: false });
          geo.rotateX(-Math.PI / 2);
          geo.translate(0, yBase, 0);
          geos.push(geo);
        } else {
          const geo = new ExtrudeGeometry(shape, { depth: building.height, bevelEnabled: false });
          geo.rotateX(-Math.PI / 2);
          geos.push(geo);
        }
      } catch { /* skip */ }
    }

    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [buildings, hm]);

  const normalMap = useMemo(() => {
    const tex = getFacadeNorm().clone();
    tex.repeat.set(60, 30);
    tex.needsUpdate = true;
    return tex;
  }, []);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color="#ffffff"
        roughness={1}
        metalness={0}
        normalMap={normalMap}
        normalScale={new Vector2(0.6, 0.6)}
      />
    </mesh>
  );
}

// Helper: build road-like strip geometry
function buildStripGeo(
  segments: { points: [number, number][]; halfW: number }[],
  y: number,
  hm?: HeightMap | null
): BufferGeometry | null {
  const verts: number[] = [], indices: number[] = [];
  for (const seg of segments) {
    for (let i = 0; i < seg.points.length - 1; i++) {
      const [x1, z1] = seg.points[i];
      const [x2, z2] = seg.points[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len === 0) continue;
      const nx = (-dz / len) * seg.halfW, nz = (dx / len) * seg.halfW;
      const vi = verts.length / 3;
      const y1 = hm ? groundHeightAt(x1, z1, hm) + y : y;
      const y2 = hm ? groundHeightAt(x2, z2, hm) + y : y;
      verts.push(x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz);
      verts.push(x2 + nx, y2, z2 + nz, x2 - nx, y2, z2 - nz);
      indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
    }
  }
  if (verts.length === 0) return null;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Normalize geometry for merge: strip UV for attribute compatibility
function normGeo(geo: BufferGeometry): BufferGeometry {
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  return geo;
}

// Build terrain-conforming polygon mesh: each vertex snaps to ground height + yOffset
function buildTerrainPolygon(
  polygon: [number, number][],
  yOffset: number,
  hm: HeightMap | null
): BufferGeometry | null {
  if (polygon.length < 3) return null;
  try {
    // Triangulate the polygon using ear-clipping via Shape
    const shape = new Shape();
    shape.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) shape.lineTo(polygon[i][0], polygon[i][1]);
    shape.closePath();

    // Get triangulated indices from ShapeGeometry
    const shapeGeo = new ExtrudeGeometry(shape, { depth: 0, bevelEnabled: false });
    shapeGeo.rotateX(-Math.PI / 2);

    // Snap every vertex Y to ground height
    const pos = shapeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const groundY = hm ? groundHeightAt(x, z, hm) : 0;
      pos.setY(i, groundY + yOffset);
    }
    pos.needsUpdate = true;

    // Strip UV for merge compatibility, keep indexed for smooth normals
    shapeGeo.deleteAttribute('uv');
    shapeGeo.computeVertexNormals();
    return shapeGeo;
  } catch {
    return null;
  }
}


// --- Water areas (terrain-snapped, blue tint) ---
function MergedWater({ areas, hm }: { areas: OSMArea[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if (area.type !== 'water' || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, -0.6, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial color="#ffffff"
        polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
    </mesh>
  );
}

// --- Waterways (rivers/streams as line strips, deeper channel) ---
function MergedWaterways({ waterways, hm }: { waterways: OSMWaterway[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    if (waterways.length === 0) return null;
    const segs = waterways
      .filter(w => w.points.length >= 2)
      .map(w => ({
        points: w.points,
        halfW: w.width / 2,
      }));
    return buildStripGeo(segs, -0.8, hm);
  }, [waterways, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial color="#ffffff"
        polygonOffset polygonOffsetFactor={-2.5} polygonOffsetUnits={-2.5} />
    </mesh>
  );
}

// --- Railways (merged, engraved lines) ---
function MergedRailways({ railways, hm }: { railways: OSMRailway[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    if (railways.length === 0) return null;
    const segs = railways
      .filter(r => r.points.length >= 2)
      .map(r => ({ points: r.points, halfW: r.type === 'subway' ? 2.5 : 3.5 }));
    return buildStripGeo(segs, -0.3, hm);
  }, [railways, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial color="#ffffff"
        polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}

// --- Parks (terrain-snapped, slightly green-tinged white) ---
function MergedParks({ areas, hm }: { areas: OSMArea[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if ((area.type !== 'park' && area.type !== 'playground') || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, -0.08, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial color="#ffffff"
        polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}

// --- Commercial/Retail areas (terrain-snapped) ---
function MergedCommercial({ areas, hm }: { areas: OSMArea[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if (area.type !== 'commercial' || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, -0.04, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial color="#ffffff"
        polygonOffset polygonOffsetFactor={-0.5} polygonOffsetUnits={-0.5} />
    </mesh>
  );
}

// --- School/University areas (terrain-snapped) ---
function MergedSchools({ areas, hm }: { areas: OSMArea[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if (area.type !== 'school' || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, -0.04, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial color="#ffffff"
        polygonOffset polygonOffsetFactor={-0.5} polygonOffsetUnits={-0.5} />
    </mesh>
  );
}

// --- Steps/Stairs (terrain-snapped line strips) ---
function MergedSteps({ steps, hm }: { steps: OSMSteps[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    if (steps.length === 0) return null;
    const segs = steps
      .filter(s => s.points.length >= 2)
      .map(s => ({ points: s.points, halfW: s.width / 2 }));
    return buildStripGeo(segs, -0.12, hm);
  }, [steps, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial color="#ffffff"
        polygonOffset polygonOffsetFactor={-1.5} polygonOffsetUnits={-1.5} />
    </mesh>
  );
}

// --- Bridges (elevated surface crossings) ---
function MergedBridgesNew({ bridges, hm }: { bridges: OSMBridge[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    if (bridges.length === 0) return null;
    const segs = bridges
      .filter(b => b.points.length >= 2)
      .map(b => ({ points: b.points, halfW: b.width / 2 + 1 }));
    return buildStripGeo(segs, 3, hm);
  }, [bridges, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshLambertMaterial color="#ffffff" />
    </mesh>
  );
}

// --- Pedestrian plazas (terrain-snapped) ---
function MergedPedestrian({ areas, hm }: { areas: OSMArea[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if (area.type !== 'pedestrian' || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, -0.03, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial color="#ffffff"
        polygonOffset polygonOffsetFactor={-0.8} polygonOffsetUnits={-0.8} />
    </mesh>
  );
}

// --- Platforms (railway platforms, slightly raised) ---
function MergedPlatforms({ areas, hm }: { areas: OSMArea[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if (area.type !== 'platform' || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, 0.5, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshLambertMaterial color="#ffffff"
        polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}

// --- Parking areas (terrain-snapped) ---
function MergedParking({ areas, hm }: { areas: OSMArea[]; hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if (area.type !== 'parking' || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, -0.05, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial color="#ffffff"
        polygonOffset polygonOffsetFactor={-0.5} polygonOffsetUnits={-0.5} />
    </mesh>
  );
}

// --- Terrain ground with elevation + grid texture ---
function TerrainGround({ hm }: { hm: HeightMap | null }) {
  const geometry = useMemo(() => {
    if (!hm) return null;
    const geo = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGS, GROUND_SEGS);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const n = GROUND_SEGS + 1;
    for (let i = 0; i < pos.count; i++) {
      const col = i % n;
      const row = Math.floor(i / n);
      pos.setY(i, hm.heights[row * n + col] - 0.05);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [hm]);

  const gridMap = useMemo(() => {
    const tex = getGroundGrid().clone();
    tex.repeat.set(80, 80);
    tex.needsUpdate = true;
    return tex;
  }, []);

  if (!geometry) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[4000, 4000]} />
        <meshLambertMaterial map={gridMap}
          polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>
    );
  }

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshLambertMaterial map={gridMap}
        polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
    </mesh>
  );
}

// --- District labels ---
const LABEL_RADIUS = 150;
const LABEL_PAD = 30;
const LABEL_MIN = 40;
const DOT_SPACING = 15;
const DOT_SIZE = 1.0;
const FOG_START = 600;
const FOG_END = 1400;

function computeLabelHeights(
  districts: OSMDistrict[],
  buildings: OSMBuilding[]
): number[] {
  return districts.map(d => {
    const [dx, dz] = d.position;
    let maxH = 0;
    for (const b of buildings) {
      const bx = b.center[0], bz = b.center[1];
      const dist = Math.sqrt((bx - dx) ** 2 + (bz - dz) ** 2);
      if (dist < LABEL_RADIUS && b.height > maxH) maxH = b.height;
    }
    return Math.max(LABEL_MIN, maxH + LABEL_PAD);
  });
}

// All dot poles combined into one InstancedMesh
function DotPoles({ districts, heights }: { districts: OSMDistrict[]; heights: number[] }) {
  const meshRef = useRef<InstancedMesh>(null);
  const { camera } = useThree();

  const { totalDots, dotPositions } = useMemo(() => {
    const positions: { x: number; y: number; z: number }[] = [];
    for (let di = 0; di < districts.length; di++) {
      const [px, pz] = districts[di].position;
      const h = heights[di];
      const count = Math.max(3, Math.floor(h / DOT_SPACING));
      for (let j = 0; j < count; j++) {
        const y = 5 + (j / (count - 1)) * (h - 20);
        positions.push({ x: px, y, z: pz });
      }
    }
    return { totalDots: positions.length, dotPositions: positions };
  }, [districts, heights]);

  const geo = useMemo(() => new SphereGeometry(DOT_SIZE, 6, 6), []);
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#c0c0c0', transparent: true }), []);

  // Set initial transforms
  useEffect(() => {
    if (!meshRef.current) return;
    const m = new Matrix4();
    for (let i = 0; i < totalDots; i++) {
      const p = dotPositions[i];
      m.makeTranslation(p.x, p.y, p.z);
      meshRef.current.setMatrixAt(i, m);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [totalDots, dotPositions]);

  // Distance-based fog fade
  useFrame(() => {
    if (!meshRef.current) return;
    const camPos = camera.position;
    // Group dots by district and set opacity on the whole mesh
    // Since InstancedMesh shares one material, use per-instance color alpha workaround
    // Simpler: just fade the whole material based on nearest visible distance
    let minDist = Infinity;
    for (const d of districts) {
      const dx = d.position[0] - camPos.x;
      const dz = d.position[1] - camPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist) minDist = dist;
    }
    // Keep dots visible if any district is close
    mat.opacity = minDist < FOG_END ? 1.0 : 0.0;
  });

  if (totalDots === 0) return null;
  return <instancedMesh ref={meshRef} args={[geo, mat, totalDots]} />;
}

// Single label with distance-based fog
function FogLabel({ district, height }: { district: OSMDistrict; height: number }) {
  const groupRef = useRef<any>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!groupRef.current) return;
    const [dx, dz] = district.position;
    const cx = camera.position.x, cz = camera.position.z;
    const dist = Math.sqrt((dx - cx) ** 2 + (dz - cz) ** 2);
    const opacity = 1.0 - Math.min(1.0, Math.max(0.0, (dist - FOG_START) / (FOG_END - FOG_START)));
    groupRef.current.visible = opacity > 0.01;
    // Update children materials
    groupRef.current.traverse((child: any) => {
      if (child.material) {
        child.material.opacity = opacity;
        child.material.transparent = true;
      }
    });
  });

  return (
    <group ref={groupRef}>
      <Billboard position={[district.position[0], height, district.position[1]]} follow>
        <Text
          fontSize={12}
          color="#DC143C"
          anchorX="center"
          anchorY="middle"
          fontWeight={700}
          letterSpacing={0.1}
          material-toneMapped={false}
          material-depthTest={false}
          material-transparent={true}
        >
          {district.name}
        </Text>
        {district.nameEn && (
          <Text
            position={[0, -14, 0]}
            fontSize={6}
            color="#DC143C"
            anchorX="center"
            anchorY="middle"
            fontWeight={400}
            letterSpacing={0.08}
            material-toneMapped={false}
            material-depthTest={false}
            material-transparent={true}
          >
            {district.nameEn}
          </Text>
        )}
      </Billboard>
    </group>
  );
}

function DistrictLabels({ districts, buildings }: { districts: OSMDistrict[]; buildings: OSMBuilding[] }) {
  const heights = useMemo(
    () => computeLabelHeights(districts, buildings),
    [districts, buildings]
  );

  return (
    <group>
      <DotPoles districts={districts} heights={heights} />
      {districts.map((d, i) => (
        <FogLabel key={`d-${i}`} district={d} height={heights[i]} />
      ))}
    </group>
  );
}

// --- Main ---
export function OSMCity({ area = 'shinjuku' }: { area?: CityAreaKey }) {
  const [buildings, setBuildings] = useState<OSMBuilding[]>([]);
  const [areas, setAreas] = useState<OSMArea[]>([]);
  const [railways, setRailways] = useState<OSMRailway[]>([]);
  const [waterways, setWaterways] = useState<OSMWaterway[]>([]);
  const [steps, setSteps] = useState<OSMSteps[]>([]);
  const [bridges, setBridges] = useState<OSMBridge[]>([]);
  const [districts, setDistricts] = useState<OSMDistrict[]>([]);
  const [elev, setElev] = useState<ElevationGrid | null>(null);

  // Build shared height map from elevation data (same source for ground mesh + all features)
  const hm = useMemo(() => (elev ? buildHeightMap(elev) : null), [elev]);

  useEffect(() => {
    fetchOSMBuildings(area).then(setBuildings).catch(console.error);
    fetchOSMTerrain(area).then(({ areas: a, railways: rw, waterways: ww, steps: st, bridges: br }) => {
      setAreas(a);
      setRailways(rw);
      setWaterways(ww);
      setSteps(st);
      setBridges(br);
    }).catch(() => {});
    fetchOSMDistricts(area).then(setDistricts).catch(() => {});
    fetchElevation(area).then(e => setElev(e)).catch(() => {});
  }, [area]);

  return (
    <group>
      {/* Terrain ground (with elevation if available) */}
      <TerrainGround hm={hm} />

      {/* Water: areas + waterway lines */}
      <MergedWater areas={areas} hm={hm} />
      <MergedWaterways waterways={waterways} hm={hm} />

      {/* Railways */}
      <MergedRailways railways={railways} hm={hm} />

      {/* Steps/Stairs */}
      <MergedSteps steps={steps} hm={hm} />

      {/* Bridges */}
      <MergedBridgesNew bridges={bridges} hm={hm} />

      {/* Area zones */}
      <MergedParks areas={areas} hm={hm} />
      <MergedCommercial areas={areas} hm={hm} />
      <MergedSchools areas={areas} hm={hm} />
      <MergedPedestrian areas={areas} hm={hm} />
      <MergedPlatforms areas={areas} hm={hm} />
      <MergedParking areas={areas} hm={hm} />

      {/* Buildings */}
      <MergedBuildings buildings={buildings} hm={hm} />

      {/* District boundary lines */}

      {/* Labels */}
      <DistrictLabels districts={districts} buildings={buildings} />
    </group>
  );
}
