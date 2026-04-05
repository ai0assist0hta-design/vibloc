import { Suspense, useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, N8AO, Vignette, Bloom } from '@react-three/postprocessing';
import { wrapEffect } from '@react-three/postprocessing';
import { Vector3, VSMShadowMap } from 'three';
import { OSMCity } from './OSMCity';
import { EdgeDetectionEffect, GradientFogEffect } from './effects';
import type { CityAreaKey } from '../../lib/osmLoader';

// Wrap custom postprocessing effects for R3F
const EdgeDetection = wrapEffect(EdgeDetectionEffect);
const GradientFog = wrapEffect(GradientFogEffect);

// Shared fog effect instance — so CameraFogSync can update its uniforms
let _fogEffect: GradientFogEffect | null = null;
export function getFogEffect() { return _fogEffect; }

function CameraFogSync() {
  const { camera } = useThree();
  const lookDir = useMemo(() => new Vector3(), []);

  useFrame(() => {
    if (!_fogEffect) return;
    camera.getWorldDirection(lookDir);
    // How much the camera points downward (0=horizontal, 1=straight down)
    const downDot = Math.max(0, -lookDir.y);

    // Camera distance factor: further = more overview
    const camDist = camera.position.length();
    const distFactor = Math.min(1, Math.max(0, (camDist - 300) / 900));

    // Combine: looking down OR far away triggers fog reduction
    const angleFactor = Math.pow(Math.max(0, (downDot - 0.2) / 0.8), 0.6);
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

  useEffect(() => {
    if (!target) return;
    const [x, z] = target;
    targetPos.current.set(x, 0, z);
    cameraGoal.current.set(x + 80, 120, z + 80);
    animating.current = true;
  }, [target]);

  useFrame(() => {
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
      ref={controlsRef}
      makeDefault
      maxPolarAngle={Math.PI / 2.2}
      minDistance={20}
      maxDistance={3500}
      enableDamping
      dampingFactor={0.05}
      target={[0, 0, 0]}
    />
  );
}

export function PlateauScene({
  area = 'shinjuku',
  navigateTarget,
}: {
  area?: CityAreaKey;
  navigateTarget?: [number, number] | null;
}) {
  const fogEffect = useMemo(() => {
    const e = new GradientFogEffect();
    _fogEffect = e;
    return e;
  }, []);

  return (
    <Canvas
      shadows={{ type: VSMShadowMap }}
      camera={{ position: [800, 600, 800], fov: 35, near: 0.1, far: 12000 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: '#ffffff', width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#ffffff']} />

      {/* Key light — high angle for long gradient shadows */}
      <directionalLight
        position={[300, 450, 200]}
        intensity={2.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-1200}
        shadow-camera-right={1200}
        shadow-camera-top={1200}
        shadow-camera-bottom={-1200}
        shadow-camera-near={0.5}
        shadow-camera-far={2500}
        shadow-bias={-0.0003}
        shadow-radius={8}
        shadow-blurSamples={16}
        color="#ffffff"
      />
      {/* Very subtle fill — preserve deep shadow gradients */}
      <directionalLight position={[-200, 200, -300]} intensity={0.25} color="#f5f5f5" />
      {/* Low ambient — shadows are the main visual language */}
      <ambientLight intensity={0.4} color="#ffffff" />
      <hemisphereLight args={['#ffffff', '#f0f0f0', 0.15]} />

      <Suspense fallback={null}>
        <OSMCity area={area} />
      </Suspense>

      <CameraNavigator target={navigateTarget ?? null} />
      <CameraFogSync />

      <EffectComposer>
        <N8AO aoRadius={3} intensity={2.5} distanceFalloff={0.6} halfRes={false} denoiseIterations={6} aoSamples={16} denoiseSamples={8} />
        <Bloom
          intensity={1.0}
          luminanceThreshold={0.95}
          luminanceSmoothing={0.15}
          mipmapBlur
          radius={0.6}
        />
        <primitive object={fogEffect} />
        <EdgeDetection />
        <Vignette offset={0.2} darkness={0.25} />
      </EffectComposer>
    </Canvas>
  );
}
