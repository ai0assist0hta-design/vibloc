import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Shape,
  ExtrudeGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Vector2,
  CanvasTexture,
  RepeatWrapping,
  LinearMipmapLinearFilter,
  LinearFilter,
  PlaneGeometry,
  Object3D,
  Matrix4,
  SphereGeometry,
  BoxGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  MeshLambertMaterial,
  InstancedMesh,
  Color,
  DataTexture,
  RedFormat,
  UnsignedByteType,
  NearestFilter,
  ClampToEdgeWrapping,
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
} from '../../lib/geo/osmLoader';
import { Quadtree } from '../../lib/geo/quadtree';
import { findLandmarkShape, type LandmarkShape } from '../../lib/geo/landmarks';
import { getBeatLevel, getSpectrumData, getGenreRGB, getIsPlaying, tickGenrePremix } from '../ui/music/PreviewPlayer';

// --- Building facade normal map: clean geometric grid ---


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

// Shared shader ref for per-frame uniform updates (uTime). Three.js
// onBeforeCompile hands us back the WebGLProgramParametersWithUniforms
// shape — we only ever touch `.uniforms[uName].value`, so a
// structural type covers it without pulling the full Three.js
// program type.
type ShaderRef = {
  uniforms: Record<string, { value: unknown }>;
};
let _buildingShader: ShaderRef | null = null;
// Ghost-pass shader (drawn on top with depthWrite=false). Same uniforms
// as the opaque pass but only the ring fragments are kept.
let _ghostShader: ShaderRef | null = null;

// --- Building click detection ---
// Point-in-polygon (ray casting)
function pipTest(x: number, z: number, fp: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = fp.length - 1; i < fp.length; j = i++) {
    const xi = fp[i][0], zi = fp[i][1];
    const xj = fp[j][0], zj = fp[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Distance from point to line segment
function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.sqrt((px - ax - t * dx) ** 2 + (pz - az - t * dz) ** 2);
}

// Pre-computed bounding boxes for fast spatial lookup, indexed by a quadtree
// so click hit-tests skip the linear walk over every polygon in the area.
type BuildingBBox = { minX: number; maxX: number; minZ: number; maxZ: number; idx: number };
let _bboxCache: { buildings: OSMBuilding[]; tree: Quadtree<BuildingBBox> } | null = null;

function getBBoxIndex(buildings: OSMBuilding[]): Quadtree<BuildingBBox> {
  if (_bboxCache && _bboxCache.buildings === buildings) return _bboxCache.tree;
  const bboxes: BuildingBBox[] = [];
  for (let idx = 0; idx < buildings.length; idx++) {
    const fp = buildings[idx].footprint;
    if (fp.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [px, pz] of fp) {
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
    }
    bboxes.push({ minX, maxX, minZ, maxZ, idx });
  }
  const tree = Quadtree.fromItems(bboxes);
  _bboxCache = { buildings, tree };
  return tree;
}

function findBuildingAt(x: number, y: number, z: number, buildings: OSMBuilding[]): OSMBuilding | null {
  const SEARCH_R = 15; // search radius in meters
  const tree = getBBoxIndex(buildings);

  // Collect all candidates within search radius
  type Candidate = { b: OSMBuilding; dist: number; inside: boolean };
  const candidates: Candidate[] = [];
  const queryRect = {
    minX: x - SEARCH_R,
    maxX: x + SEARCH_R,
    minZ: z - SEARCH_R,
    maxZ: z + SEARCH_R,
  };

  tree.query(queryRect, (bb) => {
    const b = buildings[bb.idx];
    // Height check: generous — click y should be within building + margin
    if (y > b.height + 5) return;

    const fp = b.footprint;
    const inside = pipTest(x, z, fp);

    // Calculate distance to footprint edges
    let edgeDist = Infinity;
    for (let i = 0; i < fp.length; i++) {
      const j = (i + 1) % fp.length;
      const d = distToSeg(x, z, fp[i][0], fp[i][1], fp[j][0], fp[j][1]);
      if (d < edgeDist) edgeDist = d;
    }

    // Distance to center
    const dx = x - b.center[0], dz = z - b.center[1];
    const centerDist = Math.sqrt(dx * dx + dz * dz);

    // Use smallest of edge and center distance
    const dist = inside ? 0 : Math.min(edgeDist, centerDist);

    if (dist < SEARCH_R) {
      candidates.push({ b, dist, inside });
    }
  });

  if (candidates.length === 0) return null;

  // Sort: inside first, then by distance, prefer taller buildings at same distance
  candidates.sort((a, c) => {
    if (a.inside && !c.inside) return -1;
    if (!a.inside && c.inside) return 1;
    if (Math.abs(a.dist - c.dist) < 0.5) {
      // Same distance: prefer taller building (more likely the one user clicked)
      return c.b.height - a.b.height;
    }
    return a.dist - c.dist;
  });

  return candidates[0].b;
}

// --- Landmark geometry builder ---
// Creates stepped-tier geometry for famous buildings (층층이 올라가는 세트백)
function buildLandmarkGeo(
  fp: [number, number][],
  baseHeight: number,
  landmark: LandmarkShape,
): BufferGeometry | null {
  const height = landmark.heightOverride ?? baseHeight;
  const geos: BufferGeometry[] = [];

  // Compute footprint centroid for scaling
  let cx = 0, cz = 0;
  for (const [x, z] of fp) { cx += x; cz += z; }
  cx /= fp.length; cz /= fp.length;

  // Helper: create scaled footprint shape centered on centroid
  function makeShape(polygon: [number, number][], scale: number): Shape {
    const s = new Shape();
    const last = polygon.length - 1;
    const sx = cx + (polygon[last][0] - cx) * scale;
    const sy = -(cz + (polygon[last][1] - cz) * scale);
    s.moveTo(sx, sy);
    for (let i = last - 1; i >= 0; i--) {
      const px = cx + (polygon[i][0] - cx) * scale;
      const py = -(cz + (polygon[i][1] - cz) * scale);
      s.lineTo(px, py);
    }
    s.closePath();
    return s;
  }

  // --- Build setback tiers (flat-topped boxes stacked) ---
  const tiers = [...landmark.setbacks].sort((a, b) => a.startFrac - b.startFrac);
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const nextStart = i + 1 < tiers.length ? tiers[i + 1].startFrac : 1.0;
    const tierHeight = (nextStart - tier.startFrac) * height;
    if (tierHeight <= 0) continue;

    const shape = makeShape(fp, tier.scale);
    const geo = new ExtrudeGeometry(shape, { depth: tierHeight, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, tier.startFrac * height, 0);
    geos.push(geo);
  }

  // --- Spire (thin cylinder on top) ---
  if (landmark.spire) {
    const [radiusFrac, spireH] = landmark.spire;
    let minX = Infinity, maxX = -Infinity;
    for (const [x] of fp) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    const bw = maxX - minX;
    const spireR = Math.max(0.3, bw * radiusFrac);
    const spireBase = height;
    const sGeo = new CylinderGeometry(spireR * 0.15, spireR, spireH, 6);
    sGeo.translate(cx, spireBase + spireH / 2, cz);
    geos.push(sGeo);
  }

  if (geos.length === 0) return null;

  // Normalize all geometries for merge compatibility
  for (let i = 0; i < geos.length; i++) {
    let g = geos[i];
    if (g.getIndex()) {
      const ni = g.toNonIndexed();
      g.dispose();
      geos[i] = ni;
      g = ni;
    }
    if (g.hasAttribute('uv')) g.deleteAttribute('uv');
    if (g.hasAttribute('uv1')) g.deleteAttribute('uv1');
    if (g.hasAttribute('uv2')) g.deleteAttribute('uv2');
    if (!g.hasAttribute('normal')) g.computeVertexNormals();
  }

  if (geos.length === 1) return geos[0];

  try {
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  } catch (e) {
    console.warn('[Landmark] merge failed, using first segment', e);
    return geos[0];
  }
}

// --- MERGED buildings (single draw call) with face→building index map ---
// Module-level face map so click handler can access it
let _faceToBuilding: Int32Array | null = null;
let _faceBuildingsList: OSMBuilding[] | null = null;

function MergedBuildings({ buildings, hm, darkMode = false, selectedBuilding = null, onBuildingClick }: { buildings: OSMBuilding[]; hm: HeightMap | null; darkMode?: boolean; selectedBuilding?: OSMBuilding | null; onBuildingClick?: (b: OSMBuilding | null) => void }) {
  const geometry = useMemo(() => {
    if (buildings.length === 0) return null;
    const geos: BufferGeometry[] = [];
    // Track which building index each geometry belongs to
    const buildingIndices: number[] = [];

    // Noise pre-filter — drop OSM polygons that are unmistakably clutter
    // (sheds, vending kiosks, electrical cabinets, garden walls). A building
    // is "noise" only when ALL signals say so: tiny height, empty name, no
    // tenant tags, and a footprint smaller than 25 m². Anything that passes
    // even one of those tests is kept, so the filter never hides a labelled
    // or interesting structure. Runs once at merge time → zero per-frame
    // cost and a smaller merged buffer for the GPU.
    let droppedNoise = 0;
    const polyArea = (pts: [number, number][]): number => {
      let s = 0;
      for (let i = 0, n = pts.length; i < n; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % n];
        s += x1 * y2 - x2 * y1;
      }
      return Math.abs(s) * 0.5;
    };

    for (let bi = 0; bi < buildings.length; bi++) {
      const building = buildings[bi];
      const fp = building.footprint;
      if (fp.length < 3) continue;
      if (
        building.height <= 3 &&
        !building.name &&
        building.tags.length === 0 &&
        polyArea(fp) < 25
      ) {
        droppedNoise++;
        continue;
      }
      try {
        // Check if this is a famous landmark building
        const landmark = findLandmarkShape(building.name);
        let geo: BufferGeometry;

        if (landmark) {
          // Override height if landmark specifies it
          if (landmark.heightOverride) building.height = landmark.heightOverride;
          const landmarkGeo = buildLandmarkGeo(fp, building.height, landmark);
          if (landmarkGeo) {
            geo = landmarkGeo;
            // DEV-only diagnostic — too noisy for prod (LOD reissues
            // each landmark per zoom level → 8–24× duplicate logs).
            if (import.meta.env.DEV) {
              if (import.meta.env.DEV) console.log(`[Landmark] ${building.name} → custom silhouette (${building.height}m)`);
            }
          } else {
            // Fallback to standard extrusion
            const shape = new Shape();
            const last = fp.length - 1;
            shape.moveTo(fp[last][0], -fp[last][1]);
            for (let i = last - 1; i >= 0; i--) shape.lineTo(fp[i][0], -fp[i][1]);
            shape.closePath();
            geo = new ExtrudeGeometry(shape, { depth: building.height, bevelEnabled: false });
            geo.rotateX(-Math.PI / 2);
          }
        } else {
          // Standard extrusion for normal buildings
          // Why we negate y AND iterate in reverse order:
          // - Footprint stores [x, z] in the world frame where +z = north.
          // - `ExtrudeGeometry` builds the shape in its own XY plane and we
          //   later `rotateX(-π/2)` to bring depth onto world Y (height up).
          //   That rotation maps shape vertex (px, py, depth) → world
          //   (px, depth, -py), i.e. it FLIPS the sign of py.
          // - To make the rendered world z equal the stored z, we must feed
          //   shape with (px, -storedZ). The negation also reverses winding,
          //   so we walk the polygon in reverse to keep the shape CCW (which
          //   `ExtrudeGeometry` requires for outward normals).
          const shape = new Shape();
          const last = fp.length - 1;
          shape.moveTo(fp[last][0], -fp[last][1]);
          for (let i = last - 1; i >= 0; i--) shape.lineTo(fp[i][0], -fp[i][1]);
          shape.closePath();
          geo = new ExtrudeGeometry(shape, { depth: building.height, bevelEnabled: false });
          geo.rotateX(-Math.PI / 2);
        }

        // Normalize geometry: ensure non-indexed + strip UVs for merge compat
        if (geo.getIndex()) {
          const ni = geo.toNonIndexed();
          geo.dispose();
          geo = ni;
        }
        if (geo.hasAttribute('uv')) geo.deleteAttribute('uv');
        if (geo.hasAttribute('uv1')) geo.deleteAttribute('uv1');
        if (!geo.hasAttribute('normal')) geo.computeVertexNormals();

        // Per-vertex building ID
        const vCount = geo.getAttribute('position').count;
        const idArr = new Float32Array(vCount);
        idArr.fill(bi);
        geo.setAttribute('aBuildingId', new Float32BufferAttribute(idArr, 1));
        // Per-building centre XZ baked into every vertex of this extrude.
        // Because all vertices of one building share the same value the
        // varying interpolates to a constant across the entire building,
        // so the focus-ring distance test becomes per-OBJECT instead of
        // per-fragment — no more "half a building goes transparent"
        // when the radius slices through its footprint. (Standard pattern
        // from r/threejs and the BabylonJS forum threads on per-instance
        // selection in merged geometries: bake an instance attribute
        // rather than reading world position in the fragment shader.)
        const [bcx, bcz] = building.center;
        const cArr = new Float32Array(vCount * 2);
        for (let v = 0; v < vCount; v++) {
          cArr[v * 2] = bcx;
          cArr[v * 2 + 1] = bcz;
        }
        geo.setAttribute('aBuildingCenterXZ', new Float32BufferAttribute(cArr, 2));
        // Per-building height — lets the focus-ring shader compare each
        // neighbour to the selected building's height. Used by the
        // skyscraper-mode rule: when the selected building is tall, we
        // only fade neighbours that are similar-or-taller, so smaller
        // surrounding context stays visible.
        const hArr = new Float32Array(vCount);
        hArr.fill(building.height);
        geo.setAttribute('aBuildingHeight', new Float32BufferAttribute(hArr, 1));
        // Per-building residential flag (0=commercial, 1=residential)
        const resArr = new Float32Array(vCount);
        resArr.fill(building.isResidential ?? 0);
        geo.setAttribute('aIsResidential', new Float32BufferAttribute(resArr, 1));
        geos.push(geo);
        buildingIndices.push(bi);
      } catch (e) {
        if (import.meta.env.DEV) console.warn(`[city] geometry build failed for building ${bi}`, e);
        /* skip — bad triangulation, don't crash the whole batch */
      }
    }

    if (geos.length === 0) return null;

    // Build face→building map BEFORE merging (count faces per geometry)
    const faceCountPerGeo = geos.map(g => {
      const idx = g.getIndex();
      return idx ? idx.count / 3 : (g.getAttribute('position').count / 3);
    });
    const totalFaces = faceCountPerGeo.reduce((a, b) => a + b, 0);
    const faceMap = new Int32Array(totalFaces);
    let faceOffset = 0;
    for (let gi = 0; gi < geos.length; gi++) {
      const count = faceCountPerGeo[gi];
      const bi = buildingIndices[gi];
      for (let f = 0; f < count; f++) {
        faceMap[faceOffset + f] = bi;
      }
      faceOffset += count;
    }

    _faceToBuilding = faceMap;
    _faceBuildingsList = buildings;

    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (droppedNoise > 0) {
      if (import.meta.env.DEV) console.log(`[MergedBuildings] noise pre-filter dropped ${droppedNoise} of ${buildings.length} polygons`);
    }
    return merged;
  }, [buildings, hm]);

  // 32×1 R8 DataTexture carrying the music spectrum each frame.
  // Created once, kept stable across re-renders so the shader's
  // uniform reference doesn't change. Per-frame upload happens in
  // the useFrame hook below (`uniforms.uSpectrumTex.value` already
  // points here; we just mutate `image.data` and flag dirty).
  const spectrumTextureRef = useRef<DataTexture>(
    (() => {
      const tex = new DataTexture(
        new Uint8Array(32),
        32, 1,
        RedFormat,
        UnsignedByteType,
      );
      tex.magFilter = NearestFilter;
      tex.minFilter = NearestFilter;
      tex.wrapS = ClampToEdgeWrapping;
      tex.wrapT = ClampToEdgeWrapping;
      tex.needsUpdate = true;
      return tex;
    })(),
  );

  // Matte building material — flat, no reflections, no normal map
  const frostMat = useMemo(() => {
    const mat = new MeshPhysicalMaterial({
      color: darkMode ? '#22242a' : '#ffffff',
      roughness: 1.0,
      metalness: 0.0,
      emissive: darkMode ? '#1a1c22' : '#000000',
      emissiveIntensity: darkMode ? 0.2 : 0.0,
      envMapIntensity: 0.0,
      clearcoat: 0.0,
      clearcoatRoughness: 1.0,
      sheen: 0.0,
      sheenRoughness: 1.0,
      sheenColor: new Color('#000000'),
      iridescence: 0.0,
      iridescenceIOR: 1.0,
      iridescenceThicknessRange: [0, 0],
      reflectivity: 0.0,
      specularIntensity: 0.0,
      specularColor: new Color('#000000'),
      // Opaque pass: ghost-ring fragments are `discard`-ed in the shader
      // so they neither write colour nor depth. The translucent ring is
      // re-drawn by a second mesh (GhostMesh) with depthWrite=false, so
      // ghosts can never occlude the selected tower behind them.
      transparent: false,
      depthWrite: true,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uDarkMode = { value: darkMode ? 1.0 : 0.0 };
      shader.uniforms.uTime = { value: 0.0 };
      // Music-reactive beat envelope (legacy single-band signal —
      // currently unused in shader logic, kept for potential rim-
      // glow modulation downstream). Bass kick-only, decays τ=250ms.
      shader.uniforms.uBeatLevel = { value: 0.0 };
      // 32-band spectrum DataTexture (R8, 32×1) — selected building's
      // facade renders as an EQ analyzer driven by this. Each window
      // column maps via `mod 32` to one band; lit floor count = band
      // energy. Updated every frame in useFrame from
      // PreviewPlayer.getSpectrumData(). Texture instance owned by
      // the component and shared across all rebuilds via the ref.
      shader.uniforms.uSpectrumTex = { value: spectrumTextureRef.current };
      // Genre tint for the EQ bars — base hue derived from the
      // currently-playing track's genre via PreviewPlayer.getGenreRGB().
      // Default white (no tint) so unknown-genre tracks fall back to
      // a neutral analyzer. Bars use brightness gradient from this
      // hue (low floors dim → top floors HDR-bright) so the
      // height-readout stays clear while the building reads as
      // "playing jazz" / "playing pop" etc. at a glance.
      shader.uniforms.uGenreColor = { value: [1.0, 1.0, 1.0] };
      // 1 while a preview is actively playing, 0 while paused / idle.
      // Multiplied into spectrumActive so the selected building goes
      // fully calm (no baseline EQ glow at the foot) the moment audio
      // stops. Without this, the genre-tinted baseline floors stayed
      // lit indefinitely whenever the user clicked a building, even
      // before they hit play — visible as the pink/purple bottom in
      // the screenshot.
      shader.uniforms.uAudioActive = { value: 0.0 };
      // Focus / isolation mode — per-vertex ID equality test.
      // - uSelectedBuildingId : float index of the currently focused building
      //   (-1 = none). Every vertex carries `aBuildingId` so the fragment
      //   shader can do an exact `id == selected` test — pixel-perfect, no
      //   chance of spatial bleed onto an overlapping neighbour. This is the
      //   pattern recommended on the Three.js forum for selecting pieces of
      //   a merged BufferGeometry.
      // - uFocusActive ∈ [0,1]: JS-animated so dim/restore feels smooth.
      shader.uniforms.uSelectedBuildingId = { value: -1.0 };
      shader.uniforms.uFocusActive = { value: 0.0 };
      // Centre + radius of the "ghost ring" — neighbours INSIDE this disk
      // around the selected building fade to ~10 % alpha so the user can
      // see the focused tower clearly. Buildings outside the radius keep
      // their normal opacity so the rest of the city stays as context.
      shader.uniforms.uFocusCenterXZ = { value: [0, 0] };
      shader.uniforms.uFocusRadius = { value: 0.0 };
      // Skyscraper-mode: only fade neighbours whose own height is at
      // least uHeightFilterMin × uSelectedHeight. With min = 0 this
      // disables the filter (everything in the ring fades, original
      // behaviour). With min ≈ 0.85 only similar-or-taller towers
      // around a skyscraper fade — short surrounding context stays.
      shader.uniforms.uSelectedHeight = { value: 0.0 };
      shader.uniforms.uHeightFilterMin = { value: 0.0 };
      _buildingShader = shader;

      // Inject varyings
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute float aBuildingId;
attribute vec2 aBuildingCenterXZ;
attribute float aIsResidential;
attribute float aBuildingHeight;
varying float vBuildingId;
varying vec2 vBuildingCenterXZ;
varying float vIsResidential;
varying float vBuildingHeight;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vBuildingId = aBuildingId;
vBuildingCenterXZ = aBuildingCenterXZ;
vIsResidential = aIsResidential;
vBuildingHeight = aBuildingHeight;
vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
uniform float uDarkMode;
uniform float uTime;
uniform float uBeatLevel;
uniform sampler2D uSpectrumTex;
uniform vec3 uGenreColor;
uniform float uAudioActive;
uniform float uSelectedBuildingId;
uniform float uFocusActive;
uniform vec2 uFocusCenterXZ;
uniform float uFocusRadius;
uniform float uSelectedHeight;
uniform float uHeightFilterMin;
varying float vBuildingId;
varying vec2 vBuildingCenterXZ;
varying float vIsResidential;
varying float vBuildingHeight;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

// Per-building hash functions (IQ-style, position-based)
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash23(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}`
      );

      // === PART 1: Normal perturbation BEFORE lighting ===
      // Compute window grid and perturb normals at window edges to simulate
      // physically carved-in (음각) window recesses. The directional light
      // will then produce real shadows on the inset edges.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>

// ====== Window grid computation (shared with color pass below) ======
vec2 wBuildingCell = floor(vWorldPos.xz / 15.0);
float wBSeed = hash21(wBuildingCell);
float wFacadeMask = 1.0 - abs(vWorldNormal.y);

float wIsRes = step(0.5, vIsResidential);
float wStyleF = hash21(wBuildingCell + 50.0);
float wStyle = wIsRes > 0.5 ? 2.0 : floor(wStyleF * 5.0);

float wFloorH = wStyle < 0.5 ? mix(3.5, 4.5, wBSeed) :
                wStyle < 1.5 ? mix(3.0, 3.8, wBSeed) :
                wStyle < 2.5 ? mix(2.8, 3.2, wBSeed) :
                wStyle < 3.5 ? mix(3.2, 4.0, wBSeed) :
                                mix(3.5, 4.2, wBSeed);

float wColW = wStyle < 0.5 ? mix(3.5, 5.0, wBSeed) :
              wStyle < 1.5 ? mix(2.5, 3.5, wBSeed) :
              wStyle < 2.5 ? mix(1.8, 2.8, wBSeed) :
              wStyle < 3.5 ? mix(1.5, 2.2, wBSeed) :
                              mix(4.0, 6.0, wBSeed);

float wFrameH = wStyle < 0.5 ? mix(0.10, 0.15, wBSeed) :
                wStyle < 1.5 ? mix(0.18, 0.25, wBSeed) :
                wStyle < 2.5 ? mix(0.25, 0.35, wBSeed) :
                wStyle < 3.5 ? mix(0.12, 0.18, wBSeed) :
                                mix(0.08, 0.12, wBSeed);

float wFrameW = wStyle < 0.5 ? mix(0.08, 0.12, wBSeed) :
                wStyle < 1.5 ? mix(0.15, 0.22, wBSeed) :
                wStyle < 2.5 ? mix(0.20, 0.30, wBSeed) :
                wStyle < 3.5 ? mix(0.25, 0.35, wBSeed) :
                                mix(0.10, 0.15, wBSeed);

float wFloorY = vWorldPos.y;
float wFloorIdx = floor(wFloorY / wFloorH);
float wFloorFrac = fract(wFloorY / wFloorH);
float wFacadePos = vWorldPos.x + vWorldPos.z;
float wColIdx = floor(wFacadePos / wColW);
float wColFrac = fract(wFacadePos / wColW);

float wInFloor = smoothstep(wFrameH, wFrameH + 0.015, wFloorFrac) *
                 (1.0 - smoothstep(1.0 - wFrameH - 0.015, 1.0 - wFrameH, wFloorFrac));
float wInCol = smoothstep(wFrameW, wFrameW + 0.015, wColFrac) *
               (1.0 - smoothstep(1.0 - wFrameW - 0.015, 1.0 - wFrameW, wColFrac));
float wWindowMask = wInFloor * wInCol;

float wHasWindows = smoothstep(6.0, 10.0, wFloorY + hash21(wBuildingCell + 88.0) * 4.0);
wWindowMask *= wHasWindows;

// ====== Normal perturbation: simulate carved-in window recess ======
if (wWindowMask * wFacadeMask > 0.01) {
  vec3 wallN = normalize(vWorldNormal);
  vec3 tangentH = normalize(cross(wallN, vec3(0.0, 1.0, 0.0)));
  vec3 tangentV = normalize(cross(tangentH, wallN));

  float edgeBand = 0.08;
  float leftProx  = 1.0 - smoothstep(0.0, edgeBand, wColFrac - wFrameW);
  float rightProx = 1.0 - smoothstep(0.0, edgeBand, (1.0 - wFrameW) - wColFrac);
  float botProx   = 1.0 - smoothstep(0.0, edgeBand, wFloorFrac - wFrameH);
  float topProx   = 1.0 - smoothstep(0.0, edgeBand, (1.0 - wFrameH) - wFloorFrac);

  float insetStr = 0.45;
  vec3 perturbedN = wallN;
  perturbedN += tangentH * (leftProx - rightProx) * insetStr;
  perturbedN += tangentV * (botProx - topProx) * insetStr;
  perturbedN = normalize(perturbedN);

  vec3 viewPerturbedN = normalize((viewMatrix * vec4(perturbedN, 0.0)).xyz);
  normal = mix(normal, viewPerturbedN, wWindowMask * wFacadeMask);
}
`
      );

      // === PART 2: Color effects AFTER lighting ===
      // Night glow, selection highlight, etc. Uses the same grid values
      // computed in Part 1 (variables are in the same function scope).
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
// Re-use window grid values from normal perturbation pass above
// (wBuildingCell, wWindowMask, wFacadeMask, wColIdx, wFloorIdx, etc.)

// ====== Window depth color ======
vec2 winCell = vec2(wColIdx, wFloorIdx);
float winHash = hash21(winCell + wBuildingCell * 37.7);

// Edge distance for subtle additional darkening at recess edges
float edgeDistH2 = min(wFloorFrac - wFrameH, (1.0 - wFrameH) - wFloorFrac);
float edgeDistW2 = min(wColFrac - wFrameW, (1.0 - wFrameW) - wColFrac);
float edgeDist2 = min(max(edgeDistH2, 0.0), max(edgeDistW2, 0.0));
float edgeShadow2 = smoothstep(0.0, 0.04, edgeDist2);

// Day: subtle darkening for the recessed back face
float recessDarken = mix(0.88, 0.95, edgeShadow2);
vec3 dayWindow = gl_FragColor.rgb * recessDarken;

// Night: warm light from inside
float occupancy = mix(0.55, 0.85, hash21(wBuildingCell + 5.0));
float winLit = step(1.0 - occupancy, winHash);

// EQ spectrum visualization (selected building only). Each window
// column is mapped to a frequency band; the lit floor count in
// that column equals the band energy at that moment. 32 bands,
// log-spaced 30 Hz – 13 kHz, sampled from a 32×1 R8 DataTexture
// updated every frame from PreviewPlayer.getSpectrumData().
//
// Layout: column index → band via mod 32. Floor 0 (ground) is the
// "always-on" baseline; bars climb upward. We add a 1-floor peak-
// hold cap so bar tops don't flicker.
float vIsSelected = step(abs(vBuildingId - uSelectedBuildingId), 0.5);
// Only render EQ bars when (a) this building is the focused one,
// (b) focus is fully animated in, AND (c) audio is actually playing.
// Audio-paused multiplier collapses every spectrum branch below to
// zero so the building reads as a calm, unlit facade in standby.
float spectrumActive = vIsSelected * uFocusActive * uAudioActive;
// Per-building max floor count from this building's actual height
// (vBuildingHeight) and its own floor-height style (wFloorH). Without
// this, a 5-floor low-rise would try to draw a 22-floor bar and look
// broken; a 60-floor skyscraper would only ever fill 1/3. Now each
// building's bar climbs to its own roof.
float wMaxFloors = max(2.0, floor(vBuildingHeight / wFloorH));
if (spectrumActive > 0.001) {
  float bandIdx = mod(wColIdx + 64.0, 32.0);  // +64 = avoid negative
  float bandU = (bandIdx + 0.5) / 32.0;
  float bandEnergy = texture2D(uSpectrumTex, vec2(bandU, 0.5)).r;
  // Building-proportional bar mapping. Two zones:
  //   • BASELINE — small fraction (~18 %, min 1 floor) always
  //     lit so the building never looks dead. Was 30 % which
  //     consumed too much of small buildings (a 5-floor cottage
  //     had baseline 2 + dynamic range 3 — virtually any signal
  //     filled it).
  //   • DYNAMIC RANGE — linear mapping bandEnergy → bar top.
  //     No pow(0.7) expansion (made small buildings saturate at
  //     the slightest hit). No 1.15 headroom multiplier (caused
  //     short buildings to clamp-overshoot, leaving only the top
  //     floor's step boundary blinking). Roof now only reached
  //     when bandEnergy hits a true peak (≈ 1.0 post-AGC).
  // Tall tower (60 floors): baseline ≈ 11, range 49 — bars
  // breathe across most of the height.
  // Mid-rise (15 floors): baseline 2, range 13.
  // 5-floor cottage: baseline 1, range 4 — visible motion up
  // to four floors instead of "always full".
  // Single bar per column — one continuous EQ from the building's
  // ground floor all the way up to (and including) the roof on a
  // peak. No head-room cap; the bar can fully fill the silhouette.
  float dynamicRange = wMaxFloors;

  // Per-column NEIGHBOR-MIX so a dead-silent band still gets some
  // motion from its neighbors and no column ever freezes.
  float bandEnergyN1 = texture2D(uSpectrumTex, vec2((mod(bandIdx + 1.0, 32.0) + 0.5) / 32.0, 0.5)).r;
  float bandEnergyP1 = texture2D(uSpectrumTex, vec2((mod(bandIdx + 31.0, 32.0) + 0.5) / 32.0, 0.5)).r;
  float mixedEnergy = bandEnergy * 0.7 + (bandEnergyN1 + bandEnergyP1) * 0.15;
  // MOTION FLOOR — even bands that happen to be near-silent get a
  // gentle, slow sine wobble so no column ever sits at a constant
  // height. Each column has its own random phase + frequency
  // perturbation so neighbouring columns don't wave in unison;
  // amplitude is tiny (≤ 8 %) so it doesn't visually compete with
  // the music-driven motion when the band IS active.
  float colPhase = hash21(vec2(wColIdx + 0.13, vBuildingId * 0.137)) * 6.2831;
  float colSpeed = 1.2 + hash21(vec2(wColIdx + 7.0, vBuildingId * 0.31)) * 1.6;
  float wobble = 0.5 + 0.5 * sin(uTime * colSpeed + colPhase);
  float motionFloor = 0.06 * wobble;
  mixedEnergy = max(mixedEnergy, motionFloor);

  // Floor-count adaptive curve — taller buildings get slight peak
  // compression (so 60-floor towers don't always slam to ceiling),
  // short ones get a slight expansion so quiet bands still climb.
  float curveExp = wMaxFloors <= 8.0 ? 0.75 : (wMaxFloors >= 30.0 ? 0.95 : 0.85);
  float effectiveEnergy = pow(mixedEnergy, curveExp);
  float dynamicFloors = effectiveEnergy * dynamicRange;
  float barTop = dynamicFloors;
  float spectrumLit = step(wFloorIdx, barTop);
  winLit = mix(winLit, spectrumLit, spectrumActive);
}
float topFade = smoothstep(50.0, 100.0, wFloorY);
winLit *= mix(1.0, step(0.35, hash21(wBuildingCell + 99.0)), topFade);

float colorTemp = hash21(wBuildingCell + 6.0);
vec3 warmNight = vec3(1.0, 0.88, 0.65);
vec3 coolNight = vec3(0.88, 0.92, 1.0);
vec3 nightLight = mix(warmNight, coolNight, colorTemp);
nightLight *= mix(0.85, 1.15, hash21(winCell * 3.1 + wBuildingCell));

// Genre-tinted EQ bars for the selected building. The base hue is
// the playing track's genre color (jazz=blue, pop=pink, etc.); each
// floor's brightness scales with its position within the bar — dim
// at the floor where the bar tops out, brightest at the foot,
// reversed to keep ground floors most legible. We push top floors
// into HDR (>1) so they bloom under postprocessing — that's the
// "peak" cue that the VU green/yellow/red gradient used to give.
if (spectrumActive > 0.001) {
  float bandIdx2 = mod(wColIdx + 64.0, 32.0);
  float energy2 = texture2D(uSpectrumTex, vec2((bandIdx2 + 0.5) / 32.0, 0.5)).r;
  // Mirror the lit-mask geometry exactly so the colour gradient is
  // anchored to the visible bar (baseline + dynamic range). Same
  // simplified linear mapping as above — no pow, no 1.15 headroom
  // — so colour stays in lockstep with which floors are actually lit.
  float baseline2 = max(1.0, floor(wMaxFloors * 0.18));
  float dynamicRange2 = wMaxFloors - baseline2;
  // Same pow(1.6) squash as the lit-mask above so colour gradient
  // stays anchored to the actual bar position.
  float barTop2 = baseline2 + pow(energy2, 1.6) * dynamicRange2;
  float floorWithinBar = clamp(wFloorIdx / max(barTop2, 1.0), 0.0, 1.0);
  // Brightness ramp 0.55 -> 1.6 from base to peak. >1 lands in HDR
  // so Bloom picks up the bar tips. Slightly wider range so
  // baseline floors still read as genuinely lit.
  float bright = mix(0.55, 1.6, floorWithinBar);
  vec3 genreTint = uGenreColor * bright;
  nightLight = mix(nightLight, genreTint, spectrumActive);
}

// Night blink
float blinkChance = hash21(winCell * 5.3 + wBuildingCell * 2.1);
float isBlinking = step(0.72, blinkChance) * uDarkMode;
float blinkSpeed = mix(0.03, 0.12, hash21(winCell * 7.1 + wBuildingCell));
float blinkPhase = hash21(winCell * 11.3 + wBuildingCell) * 6.2832;
float blinkWave = sin(uTime * blinkSpeed * 6.2832 + blinkPhase);
float blinkToggle = smoothstep(-0.15, 0.15, blinkWave);
float nightPulse = mix(1.0, blinkToggle, isBlinking);

vec3 nightWindow = nightLight * 2.5 * winLit * nightPulse;
nightWindow *= mix(0.3, 1.0, edgeShadow2);

// === Daytime glow: a few windows lit on shadowed/dark faces ===
// Detect shadowed facade: if the surface faces away from light, it's darker
// Use the fragment's current brightness as a proxy for shadow
float fragBrightness = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
float inShadow = 1.0 - smoothstep(0.35, 0.55, fragBrightness);
// Only ~10-15% of windows glow during daytime (offices, lobbies, etc.)
float dayLitChance = step(0.85, winHash);
// Dimmer warm glow for daytime — subtle interior light visible on dark faces
vec3 dayGlow = nightLight * 0.35 * dayLitChance * inShadow;
dayGlow *= mix(0.3, 1.0, edgeShadow2);
dayWindow += dayGlow;

// Composite: day = carved recess + sparse glow on shadow side, night = full glow
vec3 windowColor = mix(dayWindow, nightWindow, uDarkMode);

// EQ override (mode-aware) — selected building's facade renders the
// genre-tinted bars regardless of uDarkMode.
//   • Bug fix: previous version multiplied by winLit at the
//     composite step, which collapsed unlit windows to BLACK on
//     light-mode facades (visible black square holes). Now we ONLY
//     paint lit windows with the EQ tint and let unlit windows
//     fall through to the base facade color.
//   • Light vs dark contrast: dark mode uses HDR (×2.5) for Bloom
//     bar-tip glow; light mode drops to SDR ×1.4 + an additional
//     0.78× darken so the genre color reads as a *saturated patch*
//     against the white facade (poster-on-wall pattern) instead of
//     blowing out to white. Net: light-mode bars look slightly
//     deeper than dark-mode for equal perceptual visibility.
if (spectrumActive > 0.001) {
  float eqBoost = mix(1.4, 2.5, uDarkMode);
  float lightDarken = mix(0.78, 1.0, uDarkMode);
  vec3 eqLit = nightLight * eqBoost * lightDarken * mix(0.3, 1.0, edgeShadow2);
  windowColor = mix(windowColor, eqLit, winLit * spectrumActive);
}

gl_FragColor.rgb = mix(gl_FragColor.rgb, windowColor, wWindowMask * wFacadeMask);

// viewDir/fresnel for selection glow below
vec3 viewDir = normalize(cameraPosition - vWorldPos);
float fresnel = 1.0 - max(dot(viewDir, vWorldNormal), 0.0);

// ====== Focus / isolation (per-vertex ID + radius discard) ======
// Opaque pass: every in-ring non-selected fragment is discarded so
// the ghost pass can paint it at variable alpha. Previously a
// height gate kept short buildings opaque around a skyscraper —
// that was too binary (short = invisible-to-isolation). The new
// design discards everyone in the ring and the ghost pass alone
// decides how much each building fades by height ratio (see
// ghostMat). Result: short buildings now lightly fade instead of
// staying fully opaque, preserving context without dominating.
float insideFocus = step(abs(vBuildingId - uSelectedBuildingId), 0.5);
float dxz = distance(vBuildingCenterXZ, uFocusCenterXZ);
float inRing = (uFocusRadius > 0.0)
  ? step(dxz, uFocusRadius)
  : 0.0;
float ghostMask = (1.0 - insideFocus) * inRing * step(0.5, uFocusActive);
if (ghostMask > 0.5) discard;

// ====== Selection glow ======
float selFocus = insideFocus * uFocusActive;
if (selFocus > 0.001) {
  float selBreath = 0.78 + 0.22 * (sin(uTime * 1.6) * 0.5 + 0.5);
  vec3 selGlow = mix(vec3(0.92, 0.96, 1.0), vec3(0.65, 0.82, 1.0), uDarkMode);
  gl_FragColor.rgb += selGlow * 0.06 * selBreath * selFocus;
  float selRim = pow(fresnel, 2.0);
  gl_FragColor.rgb += selGlow * selRim * 0.40 * selBreath * selFocus * wFacadeMask;
}

#include <dithering_fragment>`
      );
    };

    return mat;
  }, [darkMode]);

  // Ghost-pass material — second mesh on the same merged geometry that
  // ONLY draws the ring fragments (insideFocus==0 && inRing==1) at ~10 %
  // alpha with depthWrite=false. Because it doesn't write depth, the
  // selected tower behind it (drawn opaquely in pass 1) is never hidden.
  // Kept dead-simple (MeshBasicMaterial, no lighting) — the ring is
  // basically a flat translucent silhouette.
  const ghostMat = useMemo(() => {
    const mat = new MeshBasicMaterial({
      color: darkMode ? new Color('#1c1d24') : new Color('#b8b9c0'),
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      depthTest: true,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSelectedBuildingId = { value: -1.0 };
      shader.uniforms.uFocusActive = { value: 0.0 };
      shader.uniforms.uFocusCenterXZ = { value: [0, 0] };
      shader.uniforms.uFocusRadius = { value: 0.0 };
      shader.uniforms.uSelectedHeight = { value: 0.0 };
      shader.uniforms.uHeightFilterMin = { value: 0.0 };
      _ghostShader = shader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute float aBuildingId;
attribute vec2 aBuildingCenterXZ;
attribute float aBuildingHeight;
varying float vBuildingId;
varying vec2 vBuildingCenterG;
varying float vBuildingHeightG;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vBuildingId = aBuildingId;
vBuildingCenterG = aBuildingCenterXZ;
vBuildingHeightG = aBuildingHeight;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
uniform float uSelectedBuildingId;
uniform float uFocusActive;
uniform vec2 uFocusCenterXZ;
uniform float uFocusRadius;
uniform float uSelectedHeight;
uniform float uHeightFilterMin;
varying float vBuildingId;
varying vec2 vBuildingCenterG;
varying float vBuildingHeightG;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `float insideFocus = step(abs(vBuildingId - uSelectedBuildingId), 0.5);
// Per-OBJECT ring test using the building's own centre (not fragment XZ).
float dxz = distance(vBuildingCenterG, uFocusCenterXZ);
float inRing = (uFocusRadius > 0.0) ? step(dxz, uFocusRadius) : 0.0;
float ghostMask = (1.0 - insideFocus) * inRing * step(0.5, uFocusActive);
if (ghostMask < 0.5) discard;
// Graduated alpha (skyscraper mode only). Tall peers (height >=
// uHeightFilterMin × selected) keep the base opacity 0.28 → heavy
// fade. Short neighbours stay more visible — alpha boosted up to
// ~2.5× (≈ 0.70) at 40 % of selected height. Smooth ramp between.
// In normal mode (uHeightFilterMin = 0) every neighbour gets the
// base 0.28 — same heavy fade as before.
float alphaScale = 1.0;
if (uHeightFilterMin > 0.0 && uSelectedHeight > 0.0) {
  float heightRatio = vBuildingHeightG / uSelectedHeight;
  alphaScale = mix(2.5, 1.0, smoothstep(0.4, uHeightFilterMin, heightRatio));
}
gl_FragColor.a *= alphaScale;
#include <dithering_fragment>`
      );
    };
    return mat;
  }, [darkMode]);

  // Resolve the selected building → its index in the buildings array. The
  // index is the same float value baked into `aBuildingId` at merge time, so
  // a single uniform update is enough to drive the highlight. Identity match
  // first (object reference), then footprint-coordinate match as a fallback
  // for cases where a fresh OSM reload reconstructs the array.
  const selectedBuildingId = useMemo<number>(() => {
    if (!selectedBuilding) return -1;
    const idx = buildings.indexOf(selectedBuilding);
    if (idx >= 0) return idx;
    // Reference mismatch (geocoder built a fresh object): take the
    // nearest building by centroid. No upper bound — the geocoder can
    // shift centroids by 5–20 m after dedup so any cap risks dropping
    // legitimate matches and leaving the focus mask "off".
    const [cx, cz] = selectedBuilding.center;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < buildings.length; i++) {
      const [bx, bz] = buildings[i].center;
      const dx = bx - cx, dz = bz - cz;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }, [selectedBuilding, buildings]);

  // Smoothly animate uFocusActive 0↔1 instead of snapping. 250ms matches the
  // panel's CSS slide-in so the dim and the info card arrive together.
  const focusActiveRef = useRef(0);
  const focusTargetRef = useRef(0);
  useEffect(() => {
    focusTargetRef.current = selectedBuildingId >= 0 ? 1 : 0;
  }, [selectedBuildingId]);

  // Update uTime + focus uniforms each frame
  useFrame(({ clock }, dt) => {
    if (!_buildingShader) return;
    _buildingShader.uniforms.uTime.value = clock.getElapsedTime();
    // Beat envelope (legacy single-band) — kept for downstream use
    // (rim glow etc.). Spectrum texture below is what actually
    // drives the EQ window visualization.
    _buildingShader.uniforms.uBeatLevel.value = getBeatLevel();
    // Upload the 32-band spectrum from PreviewPlayer into the
    // DataTexture. The shader samples this each fragment to decide
    // how many floors of each window column are lit. Three.js
    // requires `needsUpdate = true` after mutating the image data.
    {
      const tex = spectrumTextureRef.current;
      const dst = tex.image.data as Uint8Array;
      const src = getSpectrumData();
      dst.set(src);
      tex.needsUpdate = true;
    }
    // Step the cross-track genre envelope BEFORE reading the color
    // — this updates the smoothed `_genreRGB` in PreviewPlayer based
    // on (a) the lerp toward target and (b) the pre-mix toward the
    // queued next track during the last 5 s of the current preview.
    tickGenrePremix(dt);
    // Genre tint — RGB triple for the EQ bars. Mutate the existing
    // uniform array in place so we don't allocate a new one per
    // frame (Three.js detects array mutations via reference + the
    // shader's auto-uniform uploader).
    {
      const dst = _buildingShader.uniforms.uGenreColor.value as number[];
      const src = getGenreRGB();
      dst[0] = src[0]; dst[1] = src[1]; dst[2] = src[2];
    }
    // Audio-active envelope — exponentially approaches 1 while a
    // preview is playing, 0 while paused / idle. Smooth fade ≈ 200ms
    // (tau 0.10) so the EQ bars don't snap on/off the moment the
    // user toggles play, and so a brief network hiccup that flips
    // isPlaying off for one frame doesn't black-out the facade.
    {
      const u = _buildingShader.uniforms.uAudioActive as { value: number };
      const target = getIsPlaying() ? 1.0 : 0.0;
      const tauAudio = 0.10;
      const ka = 1 - Math.exp(-dt / tauAudio);
      u.value = u.value + (target - u.value) * ka;
    }

    // Exponential approach toward target (frame-rate independent).
    // 1 - exp(-dt / tau): tau≈0.12 s gives ~250ms perceived settle time.
    const tau = 0.12;
    const k = 1 - Math.exp(-dt / tau);
    focusActiveRef.current += (focusTargetRef.current - focusActiveRef.current) * k;
    if (Math.abs(focusActiveRef.current - focusTargetRef.current) < 0.001) {
      focusActiveRef.current = focusTargetRef.current;
    }
    _buildingShader.uniforms.uFocusActive.value = focusActiveRef.current;
    _buildingShader.uniforms.uSelectedBuildingId.value = selectedBuildingId;
    // Push the selected building's centre + ghost-ring radius.
    //   • Default      : 120 m ring, fade EVERY neighbour inside it.
    //   • Skyscraper   : 200 m ring, fade ONLY similar-or-taller
    //     neighbours (heightFilterMin = 0.85). Short surrounding
    //     buildings stay opaque so the user keeps spatial context
    //     when isolating a tall tower from its peer cluster.
    // Skyscraper threshold: 80 m ≈ ~22 floors. This roughly matches
    // the panel's "skyscraper" tag heuristic without requiring us to
    // pass the full tag list down to the renderer.
    let radius = 0.0;
    let cx = 0, cz = 0;
    let selectedHeight = 0.0;
    let heightFilterMin = 0.0;
    if (selectedBuildingId >= 0 && selectedBuildingId < buildings.length) {
      const sel = buildings[selectedBuildingId];
      cx = sel.center[0]; cz = sel.center[1];
      selectedHeight = sel.height;
      const isSkyscraper = sel.height >= 80;
      radius = isSkyscraper ? 200.0 : 120.0;
      heightFilterMin = isSkyscraper ? 0.85 : 0.0;
    }
    {
      const c = _buildingShader.uniforms.uFocusCenterXZ.value as number[];
      c[0] = cx; c[1] = cz;
      _buildingShader.uniforms.uFocusRadius.value = radius;
      _buildingShader.uniforms.uSelectedHeight.value = selectedHeight;
      _buildingShader.uniforms.uHeightFilterMin.value = heightFilterMin;
    }
    if (_ghostShader) {
      _ghostShader.uniforms.uFocusActive.value = focusActiveRef.current;
      _ghostShader.uniforms.uSelectedBuildingId.value = selectedBuildingId;
      const gc = _ghostShader.uniforms.uFocusCenterXZ.value as number[];
      gc[0] = cx; gc[1] = cz;
      _ghostShader.uniforms.uFocusRadius.value = radius;
      _ghostShader.uniforms.uSelectedHeight.value = selectedHeight;
      _ghostShader.uniforms.uHeightFilterMin.value = heightFilterMin;
    }
  });

  if (!geometry) return null;

  return (
    <>
      <mesh
        geometry={geometry}
        material={frostMat}
        castShadow
        receiveShadow
        onClick={(e) => {
          if (!onBuildingClick) return;
          e.stopPropagation();
          // Use faceIndex for direct triangle→building lookup (100% accurate)
          const fi = e.faceIndex;
          if (fi != null && _faceToBuilding && _faceBuildingsList === buildings) {
            const bi = _faceToBuilding[fi];
            if (bi != null && bi >= 0 && bi < buildings.length) {
              onBuildingClick(buildings[bi]);
              return;
            }
          }
          // Fallback to coordinate-based detection
          const p = e.point;
          const hit = findBuildingAt(p.x, p.y, p.z, buildings);
          onBuildingClick(hit);
        }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      />
      {/* Ghost pass: same merged geometry, but only the ring fragments
          survive the shader discard. depthWrite=false means these
          translucent neighbours can never occlude the selected tower. */}
      <mesh
        geometry={geometry}
        material={ghostMat}
        renderOrder={2}
        raycast={() => null}
      />
    </>
  );
}

// --- Rooftop equipment: antennas, HVAC units, vents ---
// Simple seeded PRNG for deterministic placement
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

type RoofItem = { x: number; y: number; z: number; type: 'antenna' | 'hvac' | 'vent' | 'pipe'; scale: number; rotY: number };

// Point-in-polygon test (ray casting)
function pointInPolygon(px: number, pz: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1];
    const xj = poly[j][0], zj = poly[j][1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function generateRoofItems(buildings: OSMBuilding[], hm: HeightMap | null): {
  antennas: RoofItem[]; hvacs: RoofItem[]; vents: RoofItem[]; pipes: RoofItem[];
} {
  const antennas: RoofItem[] = [];
  const hvacs: RoofItem[] = [];
  const vents: RoofItem[] = [];
  const pipes: RoofItem[] = [];

  for (const b of buildings) {
    if (b.height < 16) continue; // skip short buildings
    const fp = b.footprint;
    if (fp.length < 3) continue;

    // Compute bounding box of footprint
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [px, pz] of fp) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
    const bw = maxX - minX;
    const bd = maxZ - minZ;
    if (bw < 4 || bd < 4) continue; // skip tiny footprints
    const footprintArea = bw * bd;
    const [cx, cz] = b.center;

    // Deterministic random from building ID
    const seed = (cx * 73856093 + cz * 19349663 + b.height * 83492791) | 0;
    const rng = mulberry32(seed);

    const roofY = b.height;

    // Helper: try placing an item within the footprint polygon
    const tryPlace = (maxAttempts = 8): [number, number] | null => {
      const margin = Math.min(bw, bd) * 0.2;
      for (let a = 0; a < maxAttempts; a++) {
        const px = minX + margin + rng() * (bw - margin * 2);
        const pz = minZ + margin + rng() * (bd - margin * 2);
        if (pointInPolygon(px, pz, fp)) return [px, pz];
      }
      // Fallback: building center with small offset
      const px = cx + (rng() - 0.5) * bw * 0.2;
      const pz = cz + (rng() - 0.5) * bd * 0.2;
      if (pointInPolygon(px, pz, fp)) return [px, pz];
      return null;
    };

    // Tall buildings (>40m): antenna on top
    if (b.height > 40 && rng() < 0.6) {
      const pos = tryPlace();
      if (pos) antennas.push({
        x: pos[0], y: roofY, z: pos[1],
        type: 'antenna', scale: 0.6 + rng() * 0.8, rotY: rng() * Math.PI * 2,
      });
    }

    // Very tall buildings (>80m): extra antenna
    if (b.height > 80 && rng() < 0.5) {
      const pos = tryPlace();
      if (pos) antennas.push({
        x: pos[0], y: roofY, z: pos[1],
        type: 'antenna', scale: 0.4 + rng() * 0.5, rotY: rng() * Math.PI * 2,
      });
    }

    // HVAC units: medium+ buildings with enough roof area
    if (b.height > 18 && footprintArea > 200) {
      const hvacCount = Math.min(4, Math.floor(footprintArea / 400) + (rng() < 0.5 ? 1 : 0));
      for (let i = 0; i < hvacCount; i++) {
        const pos = tryPlace();
        if (pos) hvacs.push({
          x: pos[0], y: roofY, z: pos[1],
          type: 'hvac', scale: 0.6 + rng() * 0.6, rotY: (Math.floor(rng() * 4) / 4) * Math.PI * 2,
        });
      }
    }

    // Vents: small cylindrical exhausts
    if (b.height > 16 && rng() < 0.6) {
      const ventCount = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < ventCount; i++) {
        const pos = tryPlace();
        if (pos) vents.push({
          x: pos[0], y: roofY, z: pos[1],
          type: 'vent', scale: 0.5 + rng() * 0.5, rotY: 0,
        });
      }
    }

    // Pipes: vertical exhaust pipes on larger buildings
    if (b.height > 22 && footprintArea > 250 && rng() < 0.5) {
      const pipeCount = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < pipeCount; i++) {
        const pos = tryPlace();
        if (pos) pipes.push({
          x: pos[0], y: roofY, z: pos[1],
          type: 'pipe', scale: 0.5 + rng() * 0.6, rotY: 0,
        });
      }
    }
  }

  return { antennas, hvacs, vents, pipes };
}

function RooftopEquipment({ buildings, hm, darkMode = false }: { buildings: OSMBuilding[]; hm: HeightMap | null; darkMode?: boolean }) {
  const { antennas, hvacs, vents, pipes } = useMemo(
    () => generateRoofItems(buildings, hm), [buildings, hm]
  );

  // Shared geometries
  const antennaGeo = useMemo(() => {
    // Thin tall cylinder (antenna mast)
    const geo = new CylinderGeometry(0.15, 0.2, 8, 6);
    geo.translate(0, 4, 0);
    return geo;
  }, []);

  const antennaDishGeo = useMemo(() => {
    // Small box at top of antenna (dish/equipment)
    const base = new CylinderGeometry(0.12, 0.15, 6, 5);
    base.translate(0, 3, 0);
    const dish = new BoxGeometry(0.8, 0.5, 0.3);
    dish.translate(0, 6.5, 0);
    return BufferGeometryUtils.mergeGeometries([base, dish], false);
  }, []);

  const hvacGeo = useMemo(() => {
    // Box-shaped HVAC unit
    const box = new BoxGeometry(2.5, 1.4, 1.8);
    box.translate(0, 0.7, 0);
    return box;
  }, []);

  const ventGeo = useMemo(() => {
    // Short cylinder with wider cap
    const shaft = new CylinderGeometry(0.3, 0.3, 0.8, 8);
    shaft.translate(0, 0.4, 0);
    const cap = new CylinderGeometry(0.5, 0.45, 0.15, 8);
    cap.translate(0, 0.88, 0);
    return BufferGeometryUtils.mergeGeometries([shaft, cap], false);
  }, []);

  const pipeGeo = useMemo(() => {
    // Vertical pipe
    const pipe = new CylinderGeometry(0.2, 0.2, 2.5, 6);
    pipe.translate(0, 1.25, 0);
    return pipe;
  }, []);

  // Material: matte equipment, no reflections
  const equipMat = useMemo(() => new MeshStandardMaterial({
    color: darkMode ? '#1a1c20' : '#808488',
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.0,
  }), [darkMode]);

  const dummy = useMemo(() => new Object3D(), []);

  // Antenna instances
  const antennaRef = useRef<InstancedMesh>(null);
  useEffect(() => {
    if (!antennaRef.current) return;
    const mesh = antennaRef.current;
    // Alternate between two antenna geo types via scale trick
    for (let i = 0; i < antennas.length; i++) {
      const a = antennas[i];
      dummy.position.set(a.x, a.y, a.z);
      dummy.rotation.set(0, a.rotY, 0);
      dummy.scale.setScalar(a.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [antennas, dummy]);

  // HVAC instances
  const hvacRef = useRef<InstancedMesh>(null);
  useEffect(() => {
    if (!hvacRef.current) return;
    const mesh = hvacRef.current;
    for (let i = 0; i < hvacs.length; i++) {
      const h = hvacs[i];
      dummy.position.set(h.x, h.y, h.z);
      dummy.rotation.set(0, h.rotY, 0);
      dummy.scale.setScalar(h.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [hvacs, dummy]);

  // Vent instances
  const ventRef = useRef<InstancedMesh>(null);
  useEffect(() => {
    if (!ventRef.current) return;
    const mesh = ventRef.current;
    for (let i = 0; i < vents.length; i++) {
      const v = vents[i];
      dummy.position.set(v.x, v.y, v.z);
      dummy.rotation.set(0, v.rotY, 0);
      dummy.scale.setScalar(v.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [vents, dummy]);

  // Pipe instances
  const pipeRef = useRef<InstancedMesh>(null);
  useEffect(() => {
    if (!pipeRef.current) return;
    const mesh = pipeRef.current;
    for (let i = 0; i < pipes.length; i++) {
      const p = pipes[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rotY, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [pipes, dummy]);

  if (buildings.length === 0) return null;

  return (
    <group>
      {antennas.length > 0 && (
        <instancedMesh ref={antennaRef} args={[antennaDishGeo, equipMat, antennas.length]} castShadow />
      )}
      {hvacs.length > 0 && (
        <instancedMesh ref={hvacRef} args={[hvacGeo, equipMat, hvacs.length]} castShadow />
      )}
      {vents.length > 0 && (
        <instancedMesh ref={ventRef} args={[ventGeo, equipMat, vents.length]} castShadow />
      )}
      {pipes.length > 0 && (
        <instancedMesh ref={pipeRef} args={[pipeGeo, equipMat, pipes.length]} castShadow />
      )}
    </group>
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
    // Same y-negation + reverse winding as MergedBuildings — see comment there.
    const shape = new Shape();
    const last = polygon.length - 1;
    shape.moveTo(polygon[last][0], -polygon[last][1]);
    for (let i = last - 1; i >= 0; i--) shape.lineTo(polygon[i][0], -polygon[i][1]);
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
function MergedWater({ areas, hm, darkMode = false }: { areas: OSMArea[]; hm: HeightMap | null; darkMode?: boolean }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if (area.type !== 'water' || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, 0.02, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial color={darkMode ? '#08101a' : '#ffffff'}
        polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
    </mesh>
  );
}

// --- Waterways (rivers/streams as line strips, deeper channel) ---
function MergedWaterways({ waterways, hm, darkMode = false }: { waterways: OSMWaterway[]; hm: HeightMap | null; darkMode?: boolean }) {
  const geometry = useMemo(() => {
    if (waterways.length === 0) return null;
    const segs = waterways
      .filter(w => w.points.length >= 2)
      .map(w => ({
        points: w.points,
        halfW: w.width / 2,
      }));
    return buildStripGeo(segs, 0.02, hm);
  }, [waterways, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial color={darkMode ? '#08101a' : '#ffffff'}
        polygonOffset polygonOffsetFactor={-2.5} polygonOffsetUnits={-2.5} />
    </mesh>
  );
}

// --- Railways (merged, engraved lines) ---
function MergedRailways({ railways, hm, darkMode = false }: { railways: OSMRailway[]; hm: HeightMap | null; darkMode?: boolean }) {
  const geometry = useMemo(() => {
    if (railways.length === 0) return null;
    const segs = railways
      .filter(r => r.points.length >= 2)
      .map(r => ({ points: r.points, halfW: r.type === 'subway' ? 2.5 : 3.5 }));
    return buildStripGeo(segs, 0.02, hm);
  }, [railways, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial color={darkMode ? '#0a0a14' : '#ffffff'}
        polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}

// --- Parks (terrain-snapped, slightly green-tinged white) ---
function MergedParks({ areas, hm, darkMode = false }: { areas: OSMArea[]; hm: HeightMap | null; darkMode?: boolean }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if ((area.type !== 'park' && area.type !== 'playground') || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, 0.01, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial color={darkMode ? '#0d1008' : '#ffffff'}
        polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}

// --- Commercial/Retail areas (terrain-snapped) ---
function MergedCommercial({ areas, hm, darkMode = false }: { areas: OSMArea[]; hm: HeightMap | null; darkMode?: boolean }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if (area.type !== 'commercial' || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, 0.01, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={darkMode ? '#0e0e14' : '#f4f4f4'}
        polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
  );
}

// --- School/University areas (terrain-snapped) ---
function MergedSchools({ areas, hm, darkMode = false }: { areas: OSMArea[]; hm: HeightMap | null; darkMode?: boolean }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if (area.type !== 'school' || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, 0.01, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial color={darkMode ? '#0e0e14' : '#ffffff'}
        polygonOffset polygonOffsetFactor={-0.5} polygonOffsetUnits={-0.5} />
    </mesh>
  );
}

// --- Steps/Stairs (terrain-snapped line strips) ---
function MergedSteps({ steps, hm, darkMode = false }: { steps: OSMSteps[]; hm: HeightMap | null; darkMode?: boolean }) {
  const geometry = useMemo(() => {
    if (steps.length === 0) return null;
    const segs = steps
      .filter(s => s.points.length >= 2)
      .map(s => ({ points: s.points, halfW: s.width / 2 }));
    return buildStripGeo(segs, 0.01, hm);
  }, [steps, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial color={darkMode ? '#0a0a14' : '#ffffff'}
        polygonOffset polygonOffsetFactor={-1.5} polygonOffsetUnits={-1.5} />
    </mesh>
  );
}

// --- Bridges (elevated surface crossings) ---
function MergedBridgesNew({ bridges, hm, darkMode = false }: { bridges: OSMBridge[]; hm: HeightMap | null; darkMode?: boolean }) {
  const geometry = useMemo(() => {
    if (bridges.length === 0) return null;
    const segs = bridges
      .filter(b => b.points.length >= 2)
      .map(b => ({ points: b.points, halfW: b.width / 2 + 1 }));
    return buildStripGeo(segs, 3, hm);
  }, [bridges, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial color={darkMode ? '#0e0e14' : '#ffffff'} />
    </mesh>
  );
}

// --- Pedestrian plazas (terrain-snapped) ---
function MergedPedestrian({ areas, hm, darkMode = false }: { areas: OSMArea[]; hm: HeightMap | null; darkMode?: boolean }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if (area.type !== 'pedestrian' || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, 0.01, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial color={darkMode ? '#0e0e14' : '#ffffff'}
        polygonOffset polygonOffsetFactor={-0.8} polygonOffsetUnits={-0.8} />
    </mesh>
  );
}

// --- Platforms (railway platforms, slightly raised) ---
function MergedPlatforms({ areas, hm, darkMode = false }: { areas: OSMArea[]; hm: HeightMap | null; darkMode?: boolean }) {
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
    <mesh geometry={geometry}>
      <meshLambertMaterial color={darkMode ? '#0a0a14' : '#ffffff'}
        polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}

// --- Parking areas (terrain-snapped) ---
function MergedParking({ areas, hm, darkMode = false }: { areas: OSMArea[]; hm: HeightMap | null; darkMode?: boolean }) {
  const geometry = useMemo(() => {
    const geos: BufferGeometry[] = [];
    for (const area of areas) {
      if (area.type !== 'parking' || area.polygon.length < 3) continue;
      const geo = buildTerrainPolygon(area.polygon, 0.01, hm);
      if (geo) geos.push(geo);
    }
    if (geos.length === 0) return null;
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, [areas, hm]);

  if (!geometry) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color={darkMode ? '#0e0e14' : '#f0f0f0'}
        polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
  );
}

// --- Terrain ground ---
function TerrainGround({ darkMode = false }: { hm?: HeightMap | null; darkMode?: boolean }) {
  const groundColor = darkMode ? '#0c0c12' : '#e8e8ec';

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]} receiveShadow>
      <planeGeometry args={[20000, 20000]} />
      <meshLambertMaterial color={groundColor}
        polygonOffset polygonOffsetFactor={4} polygonOffsetUnits={4} />
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
function DotPoles({ districts, heights, darkMode = false }: { districts: OSMDistrict[]; heights: number[]; darkMode?: boolean }) {
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
  const mat = useMemo(() => new MeshBasicMaterial({ color: darkMode ? '#404050' : '#c0c0c0', depthWrite: true }), [darkMode]);

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

  // Distance-based visibility toggle (no transparency to avoid render order flickering)
  useFrame(() => {
    if (!meshRef.current) return;
    const camPos = camera.position;
    let minDist = Infinity;
    for (const d of districts) {
      const dx = d.position[0] - camPos.x;
      const dz = d.position[1] - camPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist) minDist = dist;
    }
    meshRef.current.visible = minDist < FOG_END;
  });

  if (totalDots === 0) return null;
  return <instancedMesh ref={meshRef} args={[geo, mat, totalDots]} />;
}

// Single label with distance-based fog
function FogLabel({ district, height, darkMode = false }: { district: OSMDistrict; height: number; darkMode?: boolean }) {
  const groupRef = useRef<import('three').Group | null>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!groupRef.current) return;
    const [dx, dz] = district.position;
    const cx = camera.position.x, cz = camera.position.z;
    const dist = Math.sqrt((dx - cx) ** 2 + (dz - cz) ** 2);
    // Simple visibility toggle instead of transparency to avoid render order flickering
    groupRef.current.visible = dist < FOG_END;
  });

  const labelColor = darkMode ? '#FF3355' : '#DC143C';

  return (
    <group ref={groupRef} renderOrder={999}>
      <Billboard position={[district.position[0], height, district.position[1]]} follow>
        <Text
          fontSize={12}
          color={labelColor}
          anchorX="center"
          anchorY="middle"
          fontWeight={700}
          letterSpacing={0.1}
          material-toneMapped={false}
          material-depthWrite={false}
        >
          {district.name}
        </Text>
        {district.nameEn && (
          <Text
            position={[0, -14, 0]}
            fontSize={6}
            color={labelColor}
            anchorX="center"
            anchorY="middle"
            fontWeight={400}
            letterSpacing={0.08}
            material-toneMapped={false}
            material-depthWrite={false}
          >
            {district.nameEn}
          </Text>
        )}
      </Billboard>
    </group>
  );
}

function DistrictLabels({ districts, buildings, darkMode = false }: { districts: OSMDistrict[]; buildings: OSMBuilding[]; darkMode?: boolean }) {
  const heights = useMemo(
    () => computeLabelHeights(districts, buildings),
    [districts, buildings]
  );

  return (
    <group>
      <DotPoles districts={districts} heights={heights} darkMode={darkMode} />
      {districts.map((d, i) => (
        <FogLabel key={`d-${i}`} district={d} height={heights[i]} darkMode={darkMode} />
      ))}
    </group>
  );
}

// --- Main ---
export function OSMCity({ area = 'shinjuku', darkMode = false, selectedBuilding = null, onBuildingSelect, onBuildingsLoaded }: { area?: CityAreaKey; darkMode?: boolean; selectedBuilding?: OSMBuilding | null; onBuildingSelect?: (b: OSMBuilding | null) => void; onBuildingsLoaded?: (b: OSMBuilding[]) => void }) {
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
    fetchOSMBuildings(area).then((b) => { setBuildings(b); onBuildingsLoaded?.(b); }).catch(console.error);
    fetchOSMTerrain(area).then(({ areas: a, railways: rw, waterways: ww, steps: st, bridges: br }) => {
      setAreas(a);
      setRailways(rw);
      setWaterways(ww);
      setSteps(st);
      setBridges(br);
    }).catch(() => {});
    fetchOSMDistricts(area).then(setDistricts).catch(() => {});
    // Elevation disabled — flat ground for clean look
    // fetchElevation(area).then(e => setElev(e)).catch(() => {});
  }, [area]);

  return (
    <group>
      {/* Terrain ground (with elevation if available) */}
      <TerrainGround hm={hm} darkMode={darkMode} />
      {/* Invisible ground plane for deselect on empty click */}
      <mesh
        visible={false}
        position={[0, -0.5, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onBuildingSelect?.(null);
        }}
      >
        <planeGeometry args={[20000, 20000]} />
        <meshBasicMaterial />
      </mesh>

      {/* Water: areas + waterway lines */}
      {/* Water & waterways disabled — cause shadow artifacts on ground */}

      {/* Railways, steps, bridges — disabled (shadow artifacts) */}

      {/* Area zones */}
      {/* Area zones — parking only (commercial removed: large zones cause visual split) */}
      <MergedParking areas={areas} hm={hm} darkMode={darkMode} />

      {/* Buildings */}
      <MergedBuildings buildings={buildings} hm={hm} darkMode={darkMode} selectedBuilding={selectedBuilding} onBuildingClick={onBuildingSelect} />

      {/* Labels */}
      {/* District labels disabled */}
    </group>
  );
}
