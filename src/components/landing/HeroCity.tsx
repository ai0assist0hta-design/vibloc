import { Suspense, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// Genre accent colors for glowing building bases
const GENRE_COLORS = ["#ff2d6f", "#7b5cff", "#00b3c4", "#e89833", "#34a763"];

interface BuildingData {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  glowColor: string | null;
}

function generateBuildings(): BuildingData[] {
  const buildings: BuildingData[] = [];
  const gridSize = 5;
  const spacing = 1.6;
  const glowIndices = new Set<number>();

  // Pick 5 random buildings to receive genre glow
  while (glowIndices.size < 5) {
    glowIndices.add(Math.floor(Math.random() * 18));
  }

  let index = 0;
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // Skip some cells to create organic gaps
      if (
        (row === 0 && col === 0) ||
        (row === 4 && col === 4) ||
        (row === 0 && col === 4) ||
        (row === 2 && col === 0) ||
        (row === 4 && col === 1) ||
        (row === 3 && col === 3) ||
        (row === 1 && col === 4)
      ) {
        continue;
      }

      const height = 1.5 + Math.random() * 6.5; // 1.5 - 8
      const width = 0.5 + Math.random() * 0.5;
      const depth = 0.5 + Math.random() * 0.5;

      buildings.push({
        x: (col - gridSize / 2) * spacing + (Math.random() - 0.5) * 0.3,
        z: (row - gridSize / 2) * spacing + (Math.random() - 0.5) * 0.3,
        width,
        depth,
        height,
        glowColor: glowIndices.has(index)
          ? GENRE_COLORS[index % GENRE_COLORS.length]
          : null,
      });

      index++;
    }
  }

  return buildings;
}

/** A single building with optional genre-colored glow at its base */
function Building({ data }: { data: BuildingData }) {
  const meshRef = useRef<THREE.Mesh>(null);

  return (
    <group position={[data.x, data.height / 2, data.z]}>
      {/* Main building body */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={[data.width, data.height, data.depth]} />
        <meshStandardMaterial
          color="#2a2a35"
          roughness={0.75}
          metalness={0.15}
        />
      </mesh>

      {/* Subtle top cap — slightly lighter */}
      <mesh position={[0, data.height / 2 + 0.02, 0]}>
        <boxGeometry args={[data.width + 0.02, 0.04, data.depth + 0.02]} />
        <meshStandardMaterial color="#3a3a45" roughness={0.6} metalness={0.2} />
      </mesh>

      {/* Edge highlight lines (wireframe overlay) */}
      <mesh>
        <boxGeometry args={[data.width + 0.01, data.height + 0.01, data.depth + 0.01]} />
        <meshBasicMaterial
          color="#4a4a55"
          wireframe
          transparent
          opacity={0.12}
        />
      </mesh>

      {/* Genre glow at building base */}
      {data.glowColor && (
        <pointLight
          position={[0, -data.height / 2 + 0.3, 0]}
          color={data.glowColor}
          intensity={3}
          distance={3}
          decay={2}
        />
      )}

      {/* Glow indicator — a small emissive strip at the base */}
      {data.glowColor && (
        <mesh position={[0, -data.height / 2 + 0.15, data.depth / 2 + 0.01]}>
          <planeGeometry args={[data.width * 0.6, 0.25]} />
          <meshStandardMaterial
            color={data.glowColor}
            emissive={data.glowColor}
            emissiveIntensity={2}
            transparent
            opacity={0.9}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

/** The entire city group that rotates */
function CityScene() {
  const groupRef = useRef<THREE.Group>(null);

  const buildings = useMemo(() => generateBuildings(), []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.15 * delta;
    }
  });

  return (
    <group ref={groupRef}>
      {buildings.map((b, i) => (
        <Building key={i} data={b} />
      ))}

      {/* Ground plane with subtle reflective feel */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
      >
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial
          color="#18181f"
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>

      {/* Slightly larger sub-ground for edge definition */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
      >
        <planeGeometry args={[15, 15]} />
        <meshStandardMaterial
          color="#131318"
          roughness={0.5}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}

export default function HeroCity() {
  return (
    <Suspense fallback={null}>
      <Canvas
        gl={{ alpha: true, antialias: true }}
        shadows
        camera={{
          position: [10, 8, 10],
          fov: 35,
          near: 0.1,
          far: 100,
        }}
        style={{ background: "transparent" }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[8, 12, 6]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-camera-near={0.5}
          shadow-camera-far={30}
          shadow-bias={-0.001}
        />
        <directionalLight
          position={[-4, 6, -4]}
          intensity={0.3}
          color="#b0c4de"
        />

        {/* Scene */}
        <CityScene />

        {/* Controls */}
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.8}
          maxPolarAngle={Math.PI / 2.5}
          minPolarAngle={Math.PI / 4}
        />
      </Canvas>
    </Suspense>
  );
}
