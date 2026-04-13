import { Suspense, useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { EffectComposer, Vignette } from '@react-three/postprocessing';
import { wrapEffect } from '@react-three/postprocessing';
import { Vector3, Spherical, HalfFloatType, VSMShadowMap, DirectionalLight } from 'three';
import { OSMCity } from './OSMCity';
import { GradientFogEffect } from './effects';
import type { CityAreaKey, OSMBuilding } from '../../lib/geo/osmLoader';

// Wrap custom postprocessing effects for R3F
const GradientFog = wrapEffect(GradientFogEffect);

// Shared fog effect instance — so CameraFogSync can update its uniforms
let _fogEffect: GradientFogEffect | null = null;
export function getFogEffect() { return _fogEffect; }

// Shared azimuth for compass overlay (avoids React re-renders)
let _azimuthDeg = 0;
export function getAzimuthDeg() { return _azimuthDeg; }

// Shared controls ref for reset-to-north
let _controlsRef: any = null;
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

export type NavTarget = {
  x: number;
  z: number;
  height?: number;
  footprint?: [number, number][];
};

function CameraNavigator({ target }: { target: NavTarget | null }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
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
    const distance = Math.max(140, (fitDim / 2) / Math.tan(FOV_V / 2) * 1.9);

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
    // Goal target = building mid-height. Goal camera = goal target +
    // current view direction × fit distance. The Y component of the
    // direction is preserved, so the user's pitch/altitude is untouched.
    targetPos.current.set(cx, height * 0.45, cz);
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
      ref={(el: any) => {
        controlsRef.current = el;
        if (el) _controlsRef = el;
      }}
      makeDefault
      maxPolarAngle={Math.PI / 2.2}
      minDistance={20}
      maxDistance={2800}
      enableDamping
      dampingFactor={0.05}
      target={[0, 0, 0]}
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
}: {
  area?: CityAreaKey;
  navigateTarget?: NavTarget | null;
  darkMode?: boolean;
  sunLightPos?: [number, number, number] | null;
  selectedBuilding?: OSMBuilding | null;
  onBuildingSelect?: (b: OSMBuilding | null) => void;
  onBuildingsLoaded?: (b: OSMBuilding[]) => void;
}) {
  const fogEffect = useMemo(() => {
    const e = new GradientFogEffect({
      color: new Vector3(1, 1, 1),
    });
    _fogEffect = e;
    return e;
  }, []);

  // Update fog color + density when dark mode changes
  useEffect(() => {
    if (!fogEffect) return;
    const uColor = fogEffect.uniforms.get('uFogColor');
    const uNear = fogEffect.uniforms.get('uFogNear');
    const uFar = fogEffect.uniforms.get('uFogFar');
    const uExp = fogEffect.uniforms.get('uFogExponent');
    if (uColor) {
      if (darkMode) {
        uColor.value.set(0.04, 0.04, 0.06);
        // Night: denser fog — closer start, heavier falloff
        if (uNear) uNear.value = 900;
        if (uFar) uFar.value = 3000;
        if (uExp) uExp.value = 1.6;
      } else {
        uColor.value.set(1, 1, 1);
        // Day: lighter fog
        if (uNear) uNear.value = 1200;
        if (uFar) uFar.value = 4000;
        if (uExp) uExp.value = 1.2;
      }
    }
  }, [darkMode, fogEffect]);

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
      camera={{ position: [0, 600, 1000], fov: 35, near: 10, far: 6000 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: bg, width: '100%', height: '100%' }}
    >
      <color attach="background" args={[bg]} />

      {darkMode ? (
        <>
          <directionalLight
            ref={(el: any) => {
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
            ref={(el: any) => {
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

      <CameraNavigator target={navigateTarget ?? null} />
      <ShadowFollower />
      <CameraFogSync />

      <EffectComposer frameBufferType={HalfFloatType}>
        <primitive object={fogEffect} />
        <Vignette offset={0.2} darkness={darkMode ? 0.5 : 0.25} />
      </EffectComposer>
    </Canvas>
  );
}
