import { useCallback } from 'react';
import { TilesRenderer } from '3d-tiles-renderer/r3f';
import { MeshStandardMaterial, Mesh, Color, Object3D } from 'three';

const TOKYO_WARDS: Record<string, string> = {
  shinjuku:
    'https://plateau.geospatial.jp/main/data/3d-tiles/bldg/13100_tokyo/13104_shinjuku-ku/low_resolution/tileset.json',
  shibuya:
    'https://plateau.geospatial.jp/main/data/3d-tiles/bldg/13100_tokyo/13113_shibuya-ku/low_resolution/tileset.json',
  minato:
    'https://plateau.geospatial.jp/main/data/3d-tiles/bldg/13100_tokyo/13103_minato-ku/low_resolution/tileset.json',
  chuo:
    'https://plateau.geospatial.jp/main/data/3d-tiles/bldg/13100_tokyo/13102_chuo-ku/low_resolution/tileset.json',
};

const WHITE_MATERIAL = new MeshStandardMaterial({
  color: new Color('#f5f3ef'),
  roughness: 0.95,
  metalness: 0.0,
  flatShading: false,
});

export function PlateauCity({ ward = 'shinjuku' }: { ward?: string }) {
  const url = TOKYO_WARDS[ward] || TOKYO_WARDS.shinjuku;

  // 3d-tiles-renderer EventHandler signature changed to take an event
  // object `{ scene, tile, url }` rather than the bare scene root —
  // adapt by destructuring.
  const handleLoadModel = useCallback((evt: { scene: Object3D }) => {
    evt.scene.traverse((child) => {
      if (child instanceof Mesh) {
        child.material = WHITE_MATERIAL;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, []);

  return (
    <>
      <TilesRenderer
        url={url}
        onLoadModel={handleLoadModel}
        errorTarget={6}
      />
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <planeGeometry args={[10000, 10000]} />
        <meshStandardMaterial color="#f0ede6" roughness={1} metalness={0} />
      </mesh>
    </>
  );
}
