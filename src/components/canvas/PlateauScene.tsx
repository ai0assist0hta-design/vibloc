import { Suspense, useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { EffectComposer, Vignette } from '@react-three/postprocessing';
import { wrapEffect } from '@react-three/postprocessing';
import { Vector3, Spherical, HalfFloatType, VSMShadowMap, DirectionalLight } from 'three';
import { OSMCity } from './OSMCity';
import { GradientFogEffect } from './effects';
import type { CityAreaKey, OSMBuilding } from '../../lib/osmLoader';

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

function CameraNavigator({ target }: { target: [number, number] | null }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const animating = useRef(false);
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
    if (!target) return;
    const [x, z] = target;
    targetPos.current.set(x, 0, z);
    cameraGoal.current.set(x + 80, 120, z + 80);
    animating.current = true;
  }, [target]);

  useFrame(() => {
    // Update shared azimuth for compass
    if (controlsRef.current) {
      const az = controlsRef.current.getAzimuthalAngle();
      _azimuthDeg = (az * 180) / Math.PI;
    }

    if (!animating.current || !controlsRef.current) return;
    const controls = controlsRef.current;
    const t = 0.04;
    controls.target.lerp(targetPos.current, t);
    camera.position.lerp(cameraGoal.current, t);
    if (camera.position.distanceTo(cameraGoal.current) < 0.5) animating.current = false;
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
  onBuildingSelect,
}: {
  area?: CityAreaKey;
  navigateTarget?: [number, number] | null;
  darkMode?: boolean;
  sunLightPos?: [number, number, number] | null;
  onBuildingSelect?: (b: OSMBuilding | null) => void;
}) {
  const fogEffect = useMemo(() => {
    const e = new GradientFogEffect({
      color: new Vector3(1, 1, 1),
    });
    _fogEffect = e;
    return e;
  }, []);

  // Update fog color when dark mode changes
  useEffect(() => {
    if (!fogEffect) return;
    const u = fogEffect.uniforms.get('uFogColor');
    if (u) {
      if (darkMode) {
        u.value.set(0.04, 0.04, 0.06);
      } else {
        u.value.set(1, 1, 1);
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
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-800}
            shadow-camera-right={800}
            shadow-camera-top={800}
            shadow-camera-bottom={-800}
            shadow-camera-near={1}
            shadow-camera-far={2000}
            shadow-radius={4}
            shadow-blurSamples={12}
            shadow-bias={-0.0002}
            shadow-normalBias={0.02}
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
            intensity={1.8}
            color="#f8faff"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-800}
            shadow-camera-right={800}
            shadow-camera-top={800}
            shadow-camera-bottom={-800}
            shadow-camera-near={1}
            shadow-camera-far={2000}
            shadow-radius={4}
            shadow-blurSamples={12}
            shadow-bias={-0.0002}
            shadow-normalBias={0.02}
          />
          <directionalLight position={[-200, 200, -300]} intensity={0.5} color="#e8eef5" />
          <ambientLight intensity={0.6} color="#f0f2f5" />
          <hemisphereLight args={['#f5f8ff', '#e8e8e8', 0.3]} />
        </>
      )}

      {/* Environment map for realistic reflections — hidden from background */}
      {!darkMode && (
        <Environment
          preset="city"
          background={false}
          environmentIntensity={1.2}
        />
      )}

      <Suspense fallback={null}>
        <OSMCity area={area} darkMode={darkMode} onBuildingSelect={onBuildingSelect} />
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
