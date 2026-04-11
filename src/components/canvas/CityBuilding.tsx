import { useMemo, useState, useCallback } from 'react';
import { Color, BoxGeometry } from 'three';
import type { Building } from '../../types';
import { useBuildingStore } from '../../stores/useBuildingStore';
import { getBuildingColor, getBuildingOpacity, getBuildingState } from '../../lib/geo/tasteEngine';

type CityBuildingProps = {
  building: Building;
};

const BASE_COLOR = new Color('#d0d4de');
const EDGE_COLOR = '#9090a8';

export function CityBuilding({ building }: CityBuildingProps) {
  const [hovered, setHovered] = useState(false);

  const selectBuilding = useBuildingStore((s) => s.selectBuilding);
  const selectedId = useBuildingStore((s) => s.selectedBuildingId);
  const tags = useBuildingStore(
    useCallback((s) => s.tags.get(building.id) ?? [], [building.id])
  );

  const isSelected = selectedId === building.id;
  const state = getBuildingState(tags.length);
  const tasteColor = getBuildingColor(tags);
  const tasteOpacity = getBuildingOpacity(tags.length);

  const color = state === 'empty' ? BASE_COLOR : new Color(tasteColor);

  const edgesGeo = useMemo(
    () => new BoxGeometry(building.width, building.height, building.depth),
    [building.width, building.height, building.depth]
  );

  const handleOver = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  }, []);

  const handleOut = useCallback(() => {
    setHovered(false);
    document.body.style.cursor = 'default';
  }, []);

  const handleClick = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    selectBuilding(building.id);
  }, [selectBuilding, building.id]);

  return (
    <group position={building.position}>
      <mesh
        castShadow
        receiveShadow
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      >
        <boxGeometry args={[building.width, building.height, building.depth]} />
        <meshStandardMaterial
          color={color}
          transparent={state !== 'empty'}
          opacity={state === 'empty' ? 1 : 1 - tasteOpacity + tasteOpacity}
          emissive={state === 'full' ? tasteColor : '#000000'}
          emissiveIntensity={state === 'full' ? 0.3 : 0}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      <lineSegments>
        <edgesGeometry args={[edgesGeo]} />
        <lineBasicMaterial color={EDGE_COLOR} transparent opacity={isSelected ? 0.8 : hovered ? 0.6 : 0.4} />
      </lineSegments>

      {isSelected && (
        <mesh position={[0, building.height / 2 + 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.8, 1.0, 32]} />
          <meshBasicMaterial color="#ff9500" transparent opacity={0.6} side={2} />
        </mesh>
      )}
    </group>
  );
}
