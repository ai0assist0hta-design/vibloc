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

// Shared shader ref for per-frame uniform updates (uTime)
let _buildingShader: any = null;
// Ghost-pass shader (drawn on top with depthWrite=false). Same uniforms
// as the opaque pass but only the ring fragments are kept.
let _ghostShader: any = null;

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

        let geo: ExtrudeGeometry;
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

          geo = new ExtrudeGeometry(shape, { depth: totalHeight, bevelEnabled: false });
          geo.rotateX(-Math.PI / 2);
          geo.translate(0, yBase, 0);
        } else {
          geo = new ExtrudeGeometry(shape, { depth: building.height, bevelEnabled: false });
          geo.rotateX(-Math.PI / 2);
        }
        // Per-vertex building ID. Every vertex of THIS extrude carries the
        // same float = original building index. After the merge, the fragment
        // shader compares this against `uSelectedBuildingId` for an exact,
        // pixel-perfect highlight that can never bleed onto neighbours
        // (recommended pattern from the Three.js forum thread on selecting
        // pieces of merged geometry — see commit message for the link).
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
        geos.push(geo);
        buildingIndices.push(bi);
      } catch { /* skip */ }
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
      console.log(`[MergedBuildings] noise pre-filter dropped ${droppedNoise} of ${buildings.length} polygons`);
    }
    return merged;
  }, [buildings, hm]);

  // Matte building material — flat, no reflections, no normal map
  const frostMat = useMemo(() => {
    const mat = new MeshPhysicalMaterial({
      color: darkMode ? '#22242a' : '#e0ddd8',
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
      _buildingShader = shader;

      // Inject varyings
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute float aBuildingId;
attribute vec2 aBuildingCenterXZ;
varying float vBuildingId;
varying vec2 vBuildingCenterXZ;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vBuildingId = aBuildingId;
vBuildingCenterXZ = aBuildingCenterXZ;
vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
uniform float uDarkMode;
uniform float uTime;
uniform float uSelectedBuildingId;
uniform float uFocusActive;
uniform vec2 uFocusCenterXZ;
uniform float uFocusRadius;
varying float vBuildingId;
varying vec2 vBuildingCenterXZ;
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

      // After lighting, add floor bands + fresnel with PER-BUILDING randomness
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
// Quantize world XZ to ~15m grid → stable per-building seed
vec2 buildingCell = floor(vWorldPos.xz / 15.0);
float bSeed = hash21(buildingCell);
vec3 bSeed3 = hash23(buildingCell);

// --- Facade mask: only side walls, not top/bottom ---
float facadeMask = 1.0 - abs(vWorldNormal.y);

// ====== Per-building variation parameters ======
float bandFreq = mix(2.8, 4.2, hash21(buildingCell + 1.0));
float mullionFreq = mix(1.6, 3.0, hash21(buildingCell + 2.0));
float glowBrightness = mix(0.15, 1.0, pow(hash21(buildingCell + 3.0), 0.6));
float colorTemp = hash21(buildingCell + 4.0);
float occupancy = mix(0.3, 0.9, hash21(buildingCell + 5.0));
// Per-building brightness variation (neutral, no color shift)
vec3 facadeTint = vec3(1.0) + (bSeed3 - 0.5) * 0.08;
// Keep it neutral — clamp color channels close together
facadeTint = mix(vec3(dot(facadeTint, vec3(0.333))), facadeTint, 0.4);

// ====== Floor grooves with per-floor ON/OFF ======
float floorY = vWorldPos.y;
float bandFrac = fract(floorY / bandFreq);
float floorIndex = floor(floorY / bandFreq);

float floorHash = hash21(buildingCell * 7.13 + vec2(floorIndex, floorIndex * 3.7));
float floorLit = step(1.0 - occupancy, floorHash);
float topFade = smoothstep(40.0, 80.0, floorY);
floorLit *= mix(1.0, step(0.3, hash21(buildingCell + 99.0)), topFade);

float grooveDist = min(bandFrac, 1.0 - bandFrac);
float grooveSlot = 1.0 - smoothstep(0.0, 0.035, grooveDist);
float grooveDarken = mix(0.4, 0.25, uDarkMode);
gl_FragColor.rgb *= mix(1.0, grooveDarken, grooveSlot * facadeMask);

float glowCore = 1.0 - smoothstep(0.0, 0.025, grooveDist);
float glowSpread = 1.0 - smoothstep(0.0, 0.12, grooveDist);

vec3 warmLightDay = vec3(1.0, 0.95, 0.88);
vec3 warmLightNight = vec3(1.0, 0.88, 0.65);
vec3 coolLightNight = vec3(0.95, 0.9, 0.8);
vec3 baseWarm = mix(warmLightDay, warmLightNight, uDarkMode);
vec3 baseCool = mix(warmLightDay, coolLightNight, uDarkMode);
vec3 warmLight = mix(baseWarm, baseCool, colorTemp);
warmLight *= mix(0.85, 1.15, hash21(vec2(floorIndex * 1.3, bSeed * 17.0)));

// ====== Pulse ======
float pulseSpeed = mix(0.05, 0.16, hash21(buildingCell + 10.0));
float pulsePhase = hash21(buildingCell + 11.0) * 6.2832;
float buildingPulse = sin(uTime * pulseSpeed * 6.2832 + pulsePhase) * 0.5 + 0.5;
float isBeacon = step(0.85, hash21(buildingCell + 12.0));
float buildingBreath = mix(
  mix(0.4, 1.0, buildingPulse),
  buildingPulse * 0.7,
  isBeacon
);

float floorToggleOn = step(0.65, hash21(vec2(floorIndex * 5.1, bSeed * 3.3)));
float floorToggleSpeed = mix(0.08, 0.25, hash21(vec2(floorIndex * 2.3, bSeed * 11.0)));
float floorTogglePhase = hash21(vec2(floorIndex, bSeed * 7.7)) * 6.2832;
float floorToggleWave = sin(uTime * floorToggleSpeed * 6.2832 + floorTogglePhase);
float floorToggle = step(-0.2, floorToggleWave);
float floorBreath = mix(1.0, floorToggle, floorToggleOn);

float totalPulse = buildingBreath * floorBreath;

// Bloom removed — compensate with stronger shader glow
float coreBase = mix(1.8, 3.5, uDarkMode);
float spreadBase = mix(0.2, 1.2, uDarkMode);

float coreIntensity = coreBase * glowBrightness * floorLit * totalPulse;
gl_FragColor.rgb += warmLight * glowCore * coreIntensity * facadeMask;
float spreadIntensity = spreadBase * glowBrightness * floorLit * totalPulse;
gl_FragColor.rgb += warmLight * glowSpread * spreadIntensity * facadeMask;

// ====== Per-window ======
float winSegFreq = mullionFreq;
float winSegId = floor(vWorldPos.x / winSegFreq + vWorldPos.z / winSegFreq);
float winHash = hash21(vec2(winSegId, floorIndex) + buildingCell * 31.7);
float winLit = step(0.25, winHash) * floorLit;
float winBlinkOn = step(0.6, hash21(vec2(winSegId * 3.1, floorIndex * 1.7) + buildingCell * 5.3));
float winBlinkSpeed = mix(0.055, 0.2, hash21(vec2(winSegId, floorIndex) + buildingCell * 13.0));
float winBlinkPhase = hash21(vec2(winSegId * 7.0, floorIndex * 2.1) + buildingCell) * 6.2832;
float winBlinkWave = sin(uTime * winBlinkSpeed * 6.2832 + winBlinkPhase);
float winBlink = smoothstep(-0.3, 0.1, winBlinkWave);
float winBreath = mix(1.0, winBlink, winBlinkOn);
float winGlow = (1.0 - smoothstep(0.0, 0.06, grooveDist)) * winLit * winBreath;
gl_FragColor.rgb += warmLight * winGlow * mix(0.4, 1.2, uDarkMode) * facadeMask * glowBrightness;

// --- Spandrel band ---
float spandrelBand = smoothstep(0.04, 0.12, bandFrac) * (1.0 - smoothstep(0.88, 0.96, bandFrac));
gl_FragColor.rgb *= mix(1.0, 0.92, spandrelBand * facadeMask * 0.3);

// --- Shader-based AO ---
float groundAO = smoothstep(0.0, 40.0, vWorldPos.y);
gl_FragColor.rgb *= mix(mix(0.4, 0.2, uDarkMode), 1.0, groundAO);
vec3 fakeLight = normalize(vec3(0.4, 0.8, 0.3));
float nDotL = max(dot(vWorldNormal, fakeLight), 0.0);
float shadowSim = mix(mix(0.6, 0.4, uDarkMode), 1.0, nDotL * 0.7 + 0.3);
gl_FragColor.rgb *= shadowSim;

// --- Mullion grid ---
float mx = abs(fract(vWorldPos.x / mullionFreq) - 0.5) * 2.0;
float mz = abs(fract(vWorldPos.z / mullionFreq) - 0.5) * 2.0;
float mullion = max(smoothstep(0.93, 0.99, mx), smoothstep(0.93, 0.99, mz));
float mullionDarken = mix(0.35, 0.5, hash21(buildingCell + 6.0));
gl_FragColor.rgb *= mix(1.0, 0.85, mullion * mullionDarken * facadeMask);

// --- Fresnel (neutral frosted glass) ---
vec3 viewDir = normalize(cameraPosition - vWorldPos);
float fresnel = 1.0 - max(dot(viewDir, vWorldNormal), 0.0);
float fresnelWide = pow(fresnel, 1.5);
float fresnelSharp = pow(fresnel, 3.0);
vec3 fresnelColor = mix(
  vec3(0.6, 0.6, 0.62),   // light mode: neutral silver
  vec3(0.25, 0.25, 0.3),  // dark mode: cool grey
  uDarkMode
);
fresnelColor *= facadeTint;
float fresnelStr = mix(1.2, 2.0, uDarkMode);
gl_FragColor.rgb += fresnelColor * fresnelWide * facadeMask * fresnelStr * 0.6;
gl_FragColor.rgb += vec3(0.85, 0.85, 0.88) * fresnelSharp * facadeMask * mix(0.4, 0.8, uDarkMode);

gl_FragColor.rgb *= facadeTint;

// --- Frost edge rim (neutral) ---
vec3 frostEdge = mix(vec3(0.86, 0.86, 0.88), vec3(0.14, 0.14, 0.16), uDarkMode);
gl_FragColor.rgb = mix(gl_FragColor.rgb, frostEdge, fresnelWide * 0.3 * facadeMask);

// --- Roof treatment: neutral tone + height variation ---
float roofMask = abs(vWorldNormal.y);
float roofHeight = smoothstep(5.0, 120.0, vWorldPos.y);
vec3 roofTint = mix(
  mix(vec3(0.80, 0.80, 0.82), vec3(0.75, 0.75, 0.78), roofHeight),  // light: neutral grey
  mix(vec3(0.09, 0.09, 0.11), vec3(0.13, 0.13, 0.15), roofHeight),  // dark: dark grey
  uDarkMode
);
roofTint *= (0.9 + bSeed * 0.2);
gl_FragColor.rgb = mix(gl_FragColor.rgb, roofTint, roofMask * 0.35);
// Roof fresnel
float roofFresnel = pow(1.0 - abs(dot(viewDir, vec3(0.0, 1.0, 0.0))), 2.5);
vec3 skyReflect = mix(vec3(0.75, 0.75, 0.78), vec3(0.12, 0.12, 0.15), uDarkMode);
gl_FragColor.rgb += skyReflect * roofFresnel * roofMask * mix(0.25, 0.4, uDarkMode);

// ====== Focus / isolation (per-vertex ID + radius discard) ======
// vBuildingId is the original building index baked into every vertex.
// Comparing IDs is pixel-exact so the highlight cannot bleed onto an
// overlapping neighbour. The ghost ring effect: neighbours within
// uFocusRadius metres of the selected building are DISCARDED in this
// opaque pass so they neither write colour nor depth. A second mesh
// (GhostMesh) re-draws those same fragments at ~10 percent alpha with
// depthWrite=false — that way ghosts can never occlude the selected
// tower behind them.
float insideFocus = step(abs(vBuildingId - uSelectedBuildingId), 0.5);
// Distance from THIS building's centre to the focus centre — not the
// fragment's world XZ. Because every vertex of one building shares the
// same aBuildingCenterXZ, the varying is constant across the whole
// building, so the ring test is per-OBJECT (no half-sliced buildings).
float dxz = distance(vBuildingCenterXZ, uFocusCenterXZ);
float inRing = (uFocusRadius > 0.0)
  ? step(dxz, uFocusRadius)
  : 0.0;
float ghostMask = (1.0 - insideFocus) * inRing * step(0.5, uFocusActive);
if (ghostMask > 0.5) discard;

// ====== Selection glow — subtle, visibility-friendly ======
// Per-fragment boost ONLY on the selected building. The goal is "이
// 건물이 선택됐다는 게 한눈에 보이지만, 막 빛나지는 않는다" — soft cool
// rim + a slow ~3s breath that never overrides the underlying texture.
//   - selFocus = uFocusActive on the selected building, 0 elsewhere.
//   - selBreath gives a 0.78..1.0 envelope so the rim never fully drops.
//   - Cool blueish white in light mode, slightly bluer in dark mode.
//   - Two layers: a tiny base lift across the whole building so it
//     reads as illuminated, and a stronger fresnel rim so the
//     silhouette is the most visible part.
float selFocus = insideFocus * uFocusActive;
if (selFocus > 0.001) {
  float selBreath = 0.78 + 0.22 * (sin(uTime * 1.6) * 0.5 + 0.5);
  vec3 selGlow = mix(vec3(0.92, 0.96, 1.0), vec3(0.65, 0.82, 1.0), uDarkMode);
  // Soft, even base lift across the whole selected building.
  gl_FragColor.rgb += selGlow * 0.06 * selBreath * selFocus;
  // Rim accent — strongest at silhouette edges, kept on facade only
  // so the roof doesn't pick up a stripe from the upward fresnel.
  float selRim = pow(fresnel, 2.0);
  gl_FragColor.rgb += selGlow * selRim * 0.40 * selBreath * selFocus * facadeMask;
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
      _ghostShader = shader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
attribute float aBuildingId;
attribute vec2 aBuildingCenterXZ;
varying float vBuildingId;
varying vec2 vBuildingCenterG;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vBuildingId = aBuildingId;
vBuildingCenterG = aBuildingCenterXZ;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
uniform float uSelectedBuildingId;
uniform float uFocusActive;
uniform vec2 uFocusCenterXZ;
uniform float uFocusRadius;
varying float vBuildingId;
varying vec2 vBuildingCenterG;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `float insideFocus = step(abs(vBuildingId - uSelectedBuildingId), 0.5);
// Per-OBJECT ring test using the building's own centre (not fragment XZ).
float dxz = distance(vBuildingCenterG, uFocusCenterXZ);
float inRing = (uFocusRadius > 0.0) ? step(dxz, uFocusRadius) : 0.0;
float ghostMask = (1.0 - insideFocus) * inRing * step(0.5, uFocusActive);
if (ghostMask < 0.5) discard;
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
    // Push the selected building's centre + a 120 m ghost-ring radius.
    // 120 m ≈ a tight half-block ring around the selection — close
    // enough that only the immediate neighbours fade, distant context
    // stays opaque.
    let radius = 0.0;
    let cx = 0, cz = 0;
    if (selectedBuildingId >= 0 && selectedBuildingId < buildings.length) {
      const center = buildings[selectedBuildingId].center;
      cx = center[0]; cz = center[1];
      radius = 120.0;
    }
    {
      const c = _buildingShader.uniforms.uFocusCenterXZ.value as number[];
      c[0] = cx; c[1] = cz;
      _buildingShader.uniforms.uFocusRadius.value = radius;
    }
    if (_ghostShader) {
      _ghostShader.uniforms.uFocusActive.value = focusActiveRef.current;
      _ghostShader.uniforms.uSelectedBuildingId.value = selectedBuildingId;
      const gc = _ghostShader.uniforms.uFocusCenterXZ.value as number[];
      gc[0] = cx; gc[1] = cz;
      _ghostShader.uniforms.uFocusRadius.value = radius;
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
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <planeGeometry args={[20000, 20000]} />
      <meshLambertMaterial color={groundColor}
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
  const groupRef = useRef<any>(null);
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
