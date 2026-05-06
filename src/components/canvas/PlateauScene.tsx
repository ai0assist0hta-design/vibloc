import { Suspense, useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { EffectComposer, Vignette } from '@react-three/postprocessing';
import { wrapEffect } from '@react-three/postprocessing';
import { Vector3, Spherical, HalfFloatType, VSMShadowMap, DirectionalLight } from 'three';
import { OSMCity } from './OSMCity';
import { WeatherFX } from './WeatherFX';
import { GradientFogEffect } from './effects';
import { useWeatherStore } from '../../stores/useWeatherStore';
import type { CityAreaKey, OSMBuilding } from '../../lib/geo/osmLoader';

// Wrap custom postprocessing effects for R3F
const GradientFog = wrapEffect(GradientFogEffect);

// Shared fog effect instance — so CameraFogSync can update its uniforms
let _fogEffect: GradientFogEffect | null = null;
export function getFogEffect() { return _fogEffect; }

// Shared azimuth for compass overlay (avoids React re-renders)
let _azimuthDeg = 0;
export function getAzimuthDeg() { return _azimuthDeg; }

// Shared controls ref for reset-to-north. The drei OrbitControls
// `ref` resolves to a Three.js OrbitControls instance, but importing
// the concrete type adds a chunk to the marketing bundle for no
// runtime gain — narrow structural type covers the surface we use.
type OrbitControlsRef = {
  object: import('three').Camera;
  target: import('three').Vector3;
  update(): void;
  getAzimuthalAngle(): number;
};
let _controlsRef: OrbitControlsRef | null = null;
export function resetToNorth() {
  if (!_controlsRef) return;
  const controls = _controlsRef;
  const camera = controls.object;
  const target = controls.target.clone();
  const offset = camera.position.clone().sub(target);
  const sph = new Spherical().setFromVector3(offset);

  const startTheta = sph.theta;
  // Shortest path to 0
  let endTheta = 0;
  if (startTheta > Math.PI) endTheta = Math.PI * 2;
  if (startTheta < -Math.PI) endTheta = -Math.PI * 2;
  const startTime = performance.now();
  const duration = 500;

  function step(time: number) {
    const t = Math.min((time - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    sph.theta = startTheta + (endTheta - startTheta) * eased;
    camera.position.copy(new Vector3().setFromSpherical(sph).add(target));
    controls.update();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Shared ref for the main shadow light so ShadowFollower can update it
let _shadowLight: DirectionalLight | null = null;
let _lightOffset: Vector3 = new Vector3(300, 450, 200);

/** Makes the shadow camera follow the OrbitControls target each frame */
function ShadowFollower() {
  useFrame(() => {
    if (!_shadowLight || !_controlsRef) return;
    const target = _controlsRef.target;
    // Move light target to orbit center
    _shadowLight.target.position.set(target.x, 0, target.z);
    _shadowLight.target.updateMatrixWorld();
    // Move light position: orbit center + offset (sun direction)
    _shadowLight.position.set(
      target.x + _lightOffset.x,
      _lightOffset.y,
      target.z + _lightOffset.z
    );
  });
  return null;
}

/** Pans the camera's projection frustum horizontally so the visible
 *  scene center stays aligned with the midpoint between the two side
 *  rails. Reads `--vbk-left-rail-w` / `--vbk-right-rail-w` (set by
 *  FixedToolSidebar / FixedQueueSidebar) on every frame and applies
 *  the asymmetry as a pixel offset via `camera.setViewOffset`.
 *
 *  Why setViewOffset and not camera.position: setViewOffset only
 *  affects the projection matrix, leaving the camera's transform +
 *  OrbitControls target untouched. The user can still orbit/zoom
 *  normally; the visual pan is purely a render-time crop.
 *
 *  Sign convention: NowPlayingBar center sits at
 *    centerX = leftW + (vw - leftW - rightW) / 2
 *  which is `(leftW - rightW) / 2` pixels to the RIGHT of vw/2.
 *  Three.js `setViewOffset(fullW, fullH, x, y, viewW, viewH)` renders
 *  a viewW × viewH window starting at (x, y) of a fullW × fullH
 *  virtual frustum — a POSITIVE x shifts the camera's central ray
 *  visually LEFT in the canvas. To pull the visible center RIGHT
 *  (matching the NowPlayingBar center), we pass a NEGATIVE x —
 *  i.e. -(leftW - rightW)/2 = (rightW - leftW) / 2. */
function CameraViewOffsetSync() {
  const { camera, size } = useThree();
  const lastOffsetRef = useRef(0);
  useFrame(() => {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const leftW = parseFloat(cs.getPropertyValue('--vbk-left-rail-w')) || 280;
    const rightW = parseFloat(cs.getPropertyValue('--vbk-right-rail-w')) || 280;
    // Smooth toward the target offset so quick rail drags glide
    // instead of jumping per frame. tau ≈ 80 ms (alpha 0.2 at 60 fps).
    // Flipped sign: leftW wider → negative offset → content visually
    // moves RIGHT, landing under the NowPlayingBar's new center.
    const target = (rightW - leftW) / 2;
    const next = lastOffsetRef.current + (target - lastOffsetRef.current) * 0.2;
    if (Math.abs(next - target) < 0.05) lastOffsetRef.current = target;
    else lastOffsetRef.current = next;
    const dx = lastOffsetRef.current;
    if (Math.abs(dx) < 0.5) {
      // PerspectiveCamera.clearViewOffset exists; defensive runtime
      // check in case a different camera type is ever used.
      const anyCam = camera as unknown as { clearViewOffset?: () => void };
      anyCam.clearViewOffset?.();
    } else {
      const anyCam = camera as unknown as {
        setViewOffset?: (fw: number, fh: number, x: number, y: number, w: number, h: number) => void;
      };
      anyCam.setViewOffset?.(size.width, size.height, dx, 0, size.width, size.height);
    }
  });
  return null;
}

/** One-shot landing-hero intro: camera starts high above (top-down
 *  silhouette) and zooms down to the cinematic 35° angle while
 *  rotating ~25° in yaw. 3.5 s ease-out cubic. Suspends OrbitControls'
 *  internal target tracking by writing camera.position + lookAt
 *  directly each frame, then releases when t reaches 1. */
function IntroCameraAnimation({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  const startedRef = useRef(false);
  const tStartRef = useRef(0);
  const finished = useRef(false);
  // Stratospheric start — high enough that the entire Manhattan
  // grid fits in view. At y=12000 with FOV 35°, vertical coverage
  // ≈ 2 · 12000 · tan(17.5°) ≈ 7570 units (≈ ~7.5 km, comfortably
  // larger than the visible Manhattan footprint). Camera plunges
  // to the cinematic 35° angle in ~2.4 s.
  const start = useMemo(() => new Vector3(0, 7000, 500), []);
  const end = useMemo(() => new Vector3(0, 600, 1000), []);
  const target = useMemo(() => new Vector3(0, 0, 0), []);
  useFrame(() => {
    if (!enabled || finished.current) return;
    if (!startedRef.current) {
      startedRef.current = true;
      tStartRef.current = performance.now();
    }
    const dur = 2400;
    const t = Math.min(1, (performance.now() - tStartRef.current) / dur);
    // Ease-out cubic — slow settle at end matches the CSS blur fade-in.
    const e = 1 - Math.pow(1 - t, 3);
    const pos = start.clone().lerp(end, e);
    // Slight yaw rotation: starts ~25° offset, settles to 0 at end.
    const yaw = (1 - e) * 0.45;
    pos.applyAxisAngle(new Vector3(0, 1, 0), yaw);
    camera.position.copy(pos);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (t >= 1) finished.current = true;
  });
  return null;
}

/** Sets the camera to a fixed position + lookAt once on mount,
 *  then leaves OrbitControls / interactions alone. Used for decorative
 *  static views (landing-page light backdrop) that want a specific
 *  viewpoint without the default cinematic angle. */
function StaticCameraView({
  position, target,
}: {
  position: [number, number, number];
  target?: [number, number, number];
}) {
  const { camera } = useThree();
  const appliedRef = useRef(false);
  useFrame(() => {
    if (appliedRef.current) return;
    camera.position.set(position[0], position[1], position[2]);
    const t = target ?? [0, 0, 0];
    camera.lookAt(t[0], t[1], t[2]);
    camera.updateProjectionMatrix();
    appliedRef.current = true;
  });
  return null;
}

function CameraFogSync() {
  const { camera } = useThree();
  const lookDir = useMemo(() => new Vector3(), []);

  useFrame(() => {
    if (!_fogEffect) return;
    camera.getWorldDirection(lookDir);
    const downDot = Math.max(0, -lookDir.y);

    const camDist = camera.position.length();
    // Less aggressive distance factor — only kicks in at very far zoom
    const distFactor = Math.min(1, Math.max(0, (camDist - 600) / 1400));

    // Only reduce fog when looking steeply down (>45°)
    const angleFactor = Math.pow(Math.max(0, (downDot - 0.5) / 0.5), 0.8);
    const vertical = Math.min(1, Math.max(angleFactor, distFactor));
    _fogEffect.setVertical(vertical);

  });

  return null;
}

/**
 * Compute the 2D oriented bounding box of a footprint via principal-component
 * analysis. Returns the building's centroid, the major/minor axis directions
 * (unit vectors in the world XZ plane, with +Z = north), and the extents
 * along each axis. Used by CameraNavigator so that fly-to framing aligns to
 * the building's actual orientation instead of the world axes — a long
 * Manhattan slab oriented N-S no longer ends up viewed edge-on.
 */
function computeFootprintOBB(footprint: [number, number][]) {
  let cx = 0, cz = 0;
  for (const [x, z] of footprint) { cx += x; cz += z; }
  cx /= footprint.length; cz /= footprint.length;

  // 2x2 covariance matrix [[sxx, sxz], [sxz, szz]]
  let sxx = 0, sxz = 0, szz = 0;
  for (const [x, z] of footprint) {
    const dx = x - cx, dz = z - cz;
    sxx += dx * dx; sxz += dx * dz; szz += dz * dz;
  }
  sxx /= footprint.length; sxz /= footprint.length; szz /= footprint.length;

  // Closed-form eigendecomposition for symmetric 2×2.
  const tr = sxx + szz;
  const det = sxx * szz - sxz * sxz;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lambdaMax = tr / 2 + disc; // major eigenvalue

  // Major eigenvector. When the off-diagonal is ~0 the matrix is already
  // axis-aligned, so we pick whichever diagonal entry is larger.
  let mx: number, mz: number;
  if (Math.abs(sxz) > 1e-9) {
    mx = lambdaMax - szz;
    mz = sxz;
  } else if (sxx >= szz) {
    mx = 1; mz = 0;
  } else {
    mx = 0; mz = 1;
  }
  const ml = Math.hypot(mx, mz) || 1;
  mx /= ml; mz /= ml;

  // Project all points onto the major axis (u) and the perpendicular minor
  // axis (v = rot90(major)) to read off the OBB extents.
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [x, z] of footprint) {
    const dx = x - cx, dz = z - cz;
    const u = dx * mx + dz * mz;
    const v = -dx * mz + dz * mx;
    if (u < minU) minU = u; if (u > maxU) maxU = u;
    if (v < minV) minV = v; if (v > maxV) maxV = v;
  }
  // Refine the centroid to the OBB center (PCA centroid + median of extents
  // — handles asymmetric footprints like L-shapes whose vertex centroid
  // sits off-building).
  const offU = (minU + maxU) / 2;
  const offV = (minV + maxV) / 2;
  cx += offU * mx + offV * -mz;
  cz += offU * mz + offV * mx;
  return {
    cx, cz,
    majorX: mx, majorZ: mz,           // long-axis direction
    minorX: -mz, minorZ: mx,          // short-axis direction
    sizeMajor: maxU - minU,
    sizeMinor: maxV - minV,
  };
}

/**
 * Projects the currently selected building's full silhouette to 2D
 * screen coordinates each frame so the parent panel can anchor itself
 * to the building's true edges (not an approximated radius). Reports
 * the screen-space bounding box so the panel can sit just outside the
 * silhouette with a perceptually-constant gap regardless of camera
 * angle.
 *
 * Lives inside <Canvas> because it needs `useThree` (camera + size).
 * Only emits when the bbox moves more than 1px to avoid unnecessary
 * React re-renders while the camera is idle.
 */
export type BuildingScreenAnchor = {
  /** Building's projected screen-space bounding box (pixels). */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Bbox center — kept for callers that just want a single point. */
  x: number;
  y: number;
  /** Half-width of the bbox; back-compat with earlier callers. */
  radius: number;
  /** True when at least one corner of the building is in front of the camera. */
  inFront: boolean;
};

function BuildingScreenProjector({
  building,
  onAnchor,
}: {
  building: OSMBuilding | null;
  onAnchor: (a: BuildingScreenAnchor | null) => void;
}) {
  const { camera, size } = useThree();
  const v = useMemo(() => new Vector3(), []);
  const lastRef = useRef<BuildingScreenAnchor | null>(null);

  useFrame(() => {
    if (!building) {
      if (lastRef.current !== null) {
        lastRef.current = null;
        onAnchor(null);
      }
      return;
    }
    // Project EVERY footprint vertex at both ground level AND building
    // height. Taking the screen bbox of all 2N projected points gives
    // the building's true visible outline, so the panel-to-building
    // gap stays perceptually constant as the camera orbits — projecting
    // just the center + a single radius point would breathe in/out.
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let anyInFront = false;
    const fp = building.footprint;
    const h = building.height;
    for (let i = 0; i < fp.length; i++) {
      const wx = fp[i][0];
      const wz = fp[i][1];
      // Bottom corner
      v.set(wx, 0, wz);
      v.project(camera);
      if (v.z < 1) {
        anyInFront = true;
        const sx = (v.x * 0.5 + 0.5) * size.width;
        const sy = (-v.y * 0.5 + 0.5) * size.height;
        if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
      }
      // Top corner — at building height
      v.set(wx, h, wz);
      v.project(camera);
      if (v.z < 1) {
        anyInFront = true;
        const sx = (v.x * 0.5 + 0.5) * size.width;
        const sy = (-v.y * 0.5 + 0.5) * size.height;
        if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
      }
    }

    if (!anyInFront) {
      if (lastRef.current !== null) {
        lastRef.current = null;
        onAnchor(null);
      }
      return;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const radius = (maxX - minX) / 2;

    const last = lastRef.current;
    const same = last
      && Math.abs(last.left   - minX) < 1
      && Math.abs(last.right  - maxX) < 1
      && Math.abs(last.top    - minY) < 1
      && Math.abs(last.bottom - maxY) < 1
      && last.inFront === true;
    if (same) return;
    const next: BuildingScreenAnchor = {
      left: minX, right: maxX, top: minY, bottom: maxY,
      x: cx, y: cy, radius, inFront: true,
    };
    lastRef.current = next;
    onAnchor(next);
  });

  return null;
}

export type NavTarget = {
  x: number;
  z: number;
  height?: number;
  footprint?: [number, number][];
};

function CameraNavigator({ target, interactive = true }: { target: NavTarget | null; interactive?: boolean }) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsRef | null>(null);
  const animating = useRef(false);
  const animStart = useRef(0);
  // Captured at the moment a new target arrives so we can interpolate from
  // the camera's *actual* current pose (not whatever lerp value the previous
  // animation left behind in some persistent vector).
  const fromTarget = useRef(new Vector3());
  const fromCamera = useRef(new Vector3());
  const targetPos = useRef(new Vector3());
  const cameraGoal = useRef(new Vector3());

  // Sync controls ref on every render + via callback ref
  useEffect(() => {
    const interval = setInterval(() => {
      if (controlsRef.current) _controlsRef = controlsRef.current;
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!target || !controlsRef.current) return;
    const { x, z, height: h, footprint } = target;
    const height = Math.max(20, h ?? 30);

    // Building center (use OBB-refined centroid when we have a footprint).
    let cx = x, cz = z;
    let sizeLong = 60;
    let sizeShort = 60;
    if (footprint && footprint.length >= 3) {
      const obb = computeFootprintOBB(footprint);
      cx = obb.cx;
      cz = obb.cz;
      sizeLong = Math.max(20, obb.sizeMajor);
      sizeShort = Math.max(20, obb.sizeMinor);
    }

    // Distance needed to fit the building in frame at the current FOV.
    const FOV_V = 35 * (Math.PI / 180);
    // We don't know which axis the camera is approaching from, so just
    // use the larger of the OBB axes as the conservative fit dimension.
    const projWidth = Math.max(sizeShort, sizeLong * 0.7);
    const fitDim = Math.max(projWidth, height, sizeLong * 0.5);
    // Slightly looser framing per user feedback ("너무 확대되는 것 같아").
    // 2.3 padding (was 1.9) pulls the camera ~20% further back so the
    // building doesn't fill the frame; 180 min distance (was 140)
    // does the same for tiny footprints that previously snapped too close.
    const distance = Math.max(180, (fitDim / 2) / Math.tan(FOV_V / 2) * 2.3);

    // ── Camera lock: do NOT recompute a fresh 3/4 view direction. ──
    // The previous behavior built a building-axis-aligned viewDir which
    // forced the camera to swing to a new angle every time the user
    // selected a building ("자동 시점 회전"). Instead we keep whatever
    // angle the user is currently looking from and just slide along
    // that ray until we're at the framing distance. The building gets
    // centered in the view without rotating the user's pose.
    const controls = controlsRef.current;
    const camToOldTarget = new Vector3().subVectors(camera.position, controls.target);
    const camDistNow = camToOldTarget.length();
    if (camDistNow > 1e-3) {
      camToOldTarget.normalize();
    } else {
      // Degenerate: camera is on top of the previous target. Fall back to
      // a generic SE diagonal so the math doesn't NaN.
      camToOldTarget.set(0.7071, 0.4, 0.7071).normalize();
    }
    // Goal target = building MID-HEIGHT (reverted from the earlier
    // rooftop-pivot setup that was added when the rooftop avatar
    // existed — that anchor is gone now and rooftop framing made the
    // camera tip too far up). The current camera→target direction
    // is reused so the user's pitch is preserved.
    targetPos.current.set(cx, height * 0.5, cz);
    cameraGoal.current
      .copy(camToOldTarget)
      .multiplyScalar(distance)
      .add(targetPos.current);

    fromTarget.current.copy(controls.target);
    fromCamera.current.copy(camera.position);
    animStart.current = performance.now();
    animating.current = true;
  }, [target, camera]);

  useFrame(() => {
    // Update shared azimuth for compass
    if (controlsRef.current) {
      const az = controlsRef.current.getAzimuthalAngle();
      _azimuthDeg = (az * 180) / Math.PI;
    }

    if (!animating.current || !controlsRef.current) return;
    const controls = controlsRef.current;
    // Fixed-duration ease-out cubic. 900ms matches Mapbox flyTo's perceived
    // pace and stays under the 1s "interaction-to-feedback" threshold from
    // the NN/g response-time guidelines so the click never feels laggy.
    const DURATION = 900;
    const elapsed = performance.now() - animStart.current;
    const k = Math.min(1, elapsed / DURATION);
    // Ease-out cubic: starts fast, decelerates into the target. Standard
    // easing curve in deck.gl FlyToInterpolator and most camera libraries —
    // it makes the destination feel "caught" rather than overshot.
    const e = 1 - Math.pow(1 - k, 3);
    controls.target.lerpVectors(fromTarget.current, targetPos.current, e);
    camera.position.lerpVectors(fromCamera.current, cameraGoal.current, e);
    if (k >= 1) animating.current = false;
    controls.update();
  });

  return (
    <OrbitControls
      ref={(el) => {
        controlsRef.current = el;
        if (el) _controlsRef = el as unknown as OrbitControlsRef;
      }}
      makeDefault
      maxPolarAngle={Math.PI / 2.2}
      minDistance={20}
      maxDistance={2800}
      enableDamping
      dampingFactor={0.05}
      target={[0, 0, 0]}
      // When interactive=false (e.g. landing-page hero where the
      // city is decorative), disable ALL user input — wheel zoom,
      // pan, rotate — so wheel events fall through to the document
      // and the page scrolls normally. Programmatic camera moves
      // (CameraNavigator) still work since they bypass user input.
      enabled={interactive}
      enableZoom={interactive}
      enableRotate={interactive}
      enablePan={interactive}
    />
  );
}

export function PlateauScene({
  area = 'shinjuku',
  navigateTarget,
  darkMode = false,
  sunLightPos,
  selectedBuilding = null,
  onBuildingSelect,
  onBuildingsLoaded,
  onSelectedAnchor,
  interactive = true,
  introAnimation = false,
  staticCameraView,
}: {
  area?: CityAreaKey;
  navigateTarget?: NavTarget | null;
  darkMode?: boolean;
  sunLightPos?: [number, number, number] | null;
  selectedBuilding?: OSMBuilding | null;
  onBuildingSelect?: (b: OSMBuilding | null) => void;
  onBuildingsLoaded?: (b: OSMBuilding[]) => void;
  /** Reports the selected building's projected screen anchor each
   *  frame the camera/building changes. Lets the parent attach the
   *  side panel to the building's silhouette without overlapping it. */
  onSelectedAnchor?: (a: BuildingScreenAnchor | null) => void;
  /** When false, the camera is purely decorative — orbit controls
   *  are disabled (wheel zoom / pan / rotate all off) so wheel
   *  events fall through to the document and page scrolling works.
   *  Used by the landing-page hero. */
  interactive?: boolean;
  /** When true, the camera plays a one-shot zoom-in + slight yaw
   *  rotation on mount: high-altitude → cinematic angle. Used by
   *  the landing-page hero so the city reveals itself behind the
   *  marketing copy. */
  introAnimation?: boolean;
  /** One-shot camera placement applied on mount only. Use for
   *  decorative landing surfaces (e.g. light-mode Manhattan
   *  backdrop) that need a different viewpoint from the default
   *  35° cinematic angle without animating. */
  staticCameraView?: {
    position: [number, number, number];
    target?: [number, number, number];
  };
}) {
  const fogEffect = useMemo(() => {
    const e = new GradientFogEffect({
      color: new Vector3(1, 1, 1),
    });
    _fogEffect = e;
    return e;
  }, []);

  // Subscribe to the weather store so the fog responds to live or
  // dev-toggled precipitation. Reading the category + precipitation
  // here keeps the fog reactive without touching the GradientFog
  // effect class itself.
  const weatherSnap = useWeatherStore((s) => s.snapshot);

  // Update fog color + density on dark-mode change AND when the
  // weather flips. Rain / snow / fog scenarios pull the near plane
  // closer and shift the tint cool — so the city visibly "sits in"
  // the weather.
  useEffect(() => {
    if (!fogEffect) return;
    const uColor = fogEffect.uniforms.get('uFogColor');
    const uNear = fogEffect.uniforms.get('uFogNear');
    const uFar = fogEffect.uniforms.get('uFogFar');
    const uExp = fogEffect.uniforms.get('uFogExponent');
    if (!uColor) return;

    // ── Base palette (driven by dark mode) ──────────────────────
    // Light mode: warm white fog, light density.
    // Dark mode:  cool near-black fog, heavily dense — the city
    // dissolves into the void at mid-distance for a moody Apple
    // Vision-style atmosphere. Near pulled in (900→400) and far
    // tightened (3000→2000) so even mid-range buildings get hazed.
    const base = darkMode
      ? { r: 0.04, g: 0.04, b: 0.06, near: 400,  far: 2000, exp: 1.8 }
      : { r: 1.00, g: 1.00, b: 1.00, near: 1200, far: 4000, exp: 1.2 };

    // ── Weather modifier ───────────────────────────────────────
    // Each precipitation category defines:
    //   • a 0..1 intensity floor (how close fog hugs the camera)
    //   • a tint vector mixed onto the base color (cool blue-grey
    //     for rain, slightly warmer pale for snow, neutral for fog)
    const cat = weatherSnap?.category;
    // log curve same as the rain visual (consistent perception).
    const mm = weatherSnap?.precipitationMm ?? 0;
    const i = Math.min(1, Math.log1p(mm) / Math.log1p(20));
    type Mod = { intensity: number; tint: { r: number; g: number; b: number } };
    let mod: Mod | null = null;
    if (cat === 'rain') {
      mod = { intensity: 0.35 + 0.55 * i, tint: { r: 0.55, g: 0.62, b: 0.70 } };
    } else if (cat === 'thunder') {
      mod = { intensity: 0.85, tint: { r: 0.40, g: 0.44, b: 0.52 } };
    } else if (cat === 'snow') {
      mod = { intensity: 0.45 + 0.45 * i, tint: { r: 0.86, g: 0.88, b: 0.92 } };
    } else if (cat === 'fog') {
      mod = { intensity: 0.95, tint: { r: 0.78, g: 0.80, b: 0.82 } };
    }

    if (mod) {
      // Pull the fog volume in toward the camera proportional to
      // intensity. At i=1 (heavy rain / fog) near collapses ~55 %
      // and far ~50 % — visibility halves, classic precipitation feel.
      const k = mod.intensity;
      const near = base.near * (1 - 0.55 * k);
      const far  = base.far  * (1 - 0.50 * k);
      const exp  = base.exp + 0.6 * k;
      // Mix base color toward tint by the intensity. In dark mode
      // the tint barely shifts the near-black fog — it's mostly the
      // density change that sells the weather. In light mode the
      // cool tint visibly desaturates the warm white.
      const mix = 0.55 * k;
      uColor.value.set(
        base.r * (1 - mix) + mod.tint.r * mix,
        base.g * (1 - mix) + mod.tint.g * mix,
        base.b * (1 - mix) + mod.tint.b * mix,
      );
      if (uNear) uNear.value = near;
      if (uFar) uFar.value = far;
      if (uExp) uExp.value = exp;
    } else {
      uColor.value.set(base.r, base.g, base.b);
      if (uNear) uNear.value = base.near;
      if (uFar) uFar.value = base.far;
      if (uExp) uExp.value = base.exp;
    }
  }, [darkMode, fogEffect, weatherSnap]);

  const bg = darkMode ? '#0a0a0f' : '#ffffff';

  // Sun position: use live sun or default fixed position
  const mainLightPos: [number, number, number] = sunLightPos ?? [300, 450, 200];

  // Keep light offset in sync
  useEffect(() => {
    _lightOffset.set(mainLightPos[0], mainLightPos[1], mainLightPos[2]);
  }, [mainLightPos[0], mainLightPos[1], mainLightPos[2]]);

  return (
    <Canvas
      shadows={{ type: VSMShadowMap }}
      camera={{ position: [0, 600, 1000], fov: 35, near: 10, far: 20000 }}
      // Render at full retina pixel ratio (capped at 3× for true
      // 3× displays / iPhone Pro Max) so the landing canvas reads
      // as sharp as the static UI around it. The cap matters: on
      // some 4K monitors devicePixelRatio can hit 2.5–3, and a
      // pinned ratio caused visible aliasing on building edges +
      // tenant text in the floating panels.
      dpr={[1, 3]}
      gl={{
        antialias: true,
        alpha: false,
        // Discrete GPU on laptops with hybrid graphics — keeps the
        // Manhattan canvas at 60 fps even with shadows + fog.
        powerPreference: 'high-performance',
        // Reduces z-fighting at long view distances (relevant
        // since the landing hero sets `far: 20000`).
        logarithmicDepthBuffer: true,
      }}
      style={{ background: bg, width: '100%', height: '100%' }}
    >
      <color attach="background" args={[bg]} />

      {darkMode ? (
        <>
          <directionalLight
            ref={(el: import('three').DirectionalLight | null) => {
              if (el) {
                _shadowLight = el;
                if (el.parent && !el.target.parent) el.parent.add(el.target);
              }
            }}
            position={mainLightPos}
            intensity={0.6}
            color="#909090"
            castShadow
            shadow-mapSize-width={4096}
            shadow-mapSize-height={4096}
            shadow-camera-left={-2000}
            shadow-camera-right={2000}
            shadow-camera-top={2000}
            shadow-camera-bottom={-2000}
            shadow-camera-near={1}
            shadow-camera-far={5000}
            shadow-radius={6}
            shadow-blurSamples={16}
            shadow-bias={-0.0008}
            shadow-normalBias={0.8}
          />
          <directionalLight position={[-200, 200, -300]} intensity={0.15} color="#505050" />
          <ambientLight intensity={0.15} color="#2a3050" />
          <hemisphereLight args={['#1a2040', '#080810', 0.12]} />
        </>
      ) : (
        <>
          <directionalLight
            ref={(el: import('three').DirectionalLight | null) => {
              if (el) {
                _shadowLight = el;
                if (el.parent && !el.target.parent) el.parent.add(el.target);
              }
            }}
            position={mainLightPos}
            intensity={2.2}
            color="#ffffff"
            castShadow
            shadow-mapSize-width={4096}
            shadow-mapSize-height={4096}
            shadow-camera-left={-2000}
            shadow-camera-right={2000}
            shadow-camera-top={2000}
            shadow-camera-bottom={-2000}
            shadow-camera-near={1}
            shadow-camera-far={5000}
            shadow-radius={8}
            shadow-blurSamples={20}
            shadow-bias={-0.0008}
            shadow-normalBias={0.8}
          />
          <directionalLight position={[-200, 200, -300]} intensity={0.7} color="#ffffff" />
          <ambientLight intensity={0.9} color="#ffffff" />
          <hemisphereLight args={['#ffffff', '#f0f0f0', 0.5]} />
        </>
      )}

      {/* Environment map removed — clean matte look, no reflections */}

      <Suspense fallback={null}>
        <OSMCity area={area} darkMode={darkMode} selectedBuilding={selectedBuilding} onBuildingSelect={onBuildingSelect} onBuildingsLoaded={onBuildingsLoaded} />
      </Suspense>

      <CameraNavigator target={navigateTarget ?? null} interactive={interactive} />
      <IntroCameraAnimation enabled={introAnimation} />
      {staticCameraView && (
        <StaticCameraView
          position={staticCameraView.position}
          target={staticCameraView.target}
        />
      )}
      <ShadowFollower />
      <CameraFogSync />
      <CameraViewOffsetSync />
      {onSelectedAnchor && (
        <BuildingScreenProjector
          building={selectedBuilding}
          onAnchor={onSelectedAnchor}
        />
      )}

      {/* Weather precipitation overlay — renders rain / snow particles
          when WeatherSnapshot.category matches. No-op on clear days. */}
      <WeatherFX />

      <EffectComposer frameBufferType={HalfFloatType}>
        <primitive object={fogEffect} />
        <Vignette offset={0.2} darkness={darkMode ? 0.5 : 0.25} />
      </EffectComposer>
    </Canvas>
  );
}
