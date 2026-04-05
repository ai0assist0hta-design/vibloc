import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, N8AO, Vignette } from '@react-three/postprocessing';
import { City } from './City';
import { useBuildingStore } from '../../stores/useBuildingStore';

function DeselectOnMiss() {
  const selectBuilding = useBuildingStore((s) => s.selectBuilding);
  return (
    <mesh
      visible={false}
      position={[0, -0.1, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={() => selectBuilding(null)}
    >
      <planeGeometry args={[500, 500]} />
      <meshBasicMaterial />
    </mesh>
  );
}

export function Scene() {
  return (
    <Canvas
      shadows
      camera={{ position: [40, 35, 40], fov: 45, near: 0.1, far: 500 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: '#f0ede6', width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#f0ede6']} />
      <fog attach="fog" args={['#f0ede6', 60, 120]} />

      <ambientLight intensity={0.3} />
      <directionalLight
        position={[30, 50, 20]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <hemisphereLight args={['#ffecd2', '#b0c4de', 0.4]} />

      <Suspense fallback={null}>
        <City />
      </Suspense>
      <DeselectOnMiss />

      <OrbitControls
        makeDefault
        maxPolarAngle={Math.PI / 2.2}
        minDistance={10}
        maxDistance={100}
        enableDamping
        dampingFactor={0.05}
      />

      <EffectComposer>
        <N8AO aoRadius={0.5} intensity={2} distanceFalloff={0.5} />
        <Vignette offset={0.2} darkness={0.4} />
      </EffectComposer>
    </Canvas>
  );
}
