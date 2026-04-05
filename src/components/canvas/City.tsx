import { useEffect, useMemo, useCallback, useState } from 'react';
import { Color, BoxGeometry } from 'three';
import { useBuildingStore } from '../../stores/useBuildingStore';
import { getBuildingColor, getBuildingState, getFloorColor, getFloorTagCount } from '../../lib/tasteEngine';
import type { Building, Tag } from '../../types';

const BASE_COLOR = new Color('#d0d4de');
const EDGE_COLOR = '#9090a8';
const FLOOR_HEIGHT = 3;
const FLOOR_GAP = 0.08;

function FloorMesh({ building, floor, tags, isSelectedBuilding }: {
  building: Building;
  floor: number;
  tags: Tag[];
  isSelectedBuilding: boolean;
}) {
  const floorColor = getFloorColor(tags, floor);
  const floorTags = getFloorTagCount(tags, floor);
  const hasTag = floorTags > 0;
  const yOffset = (floor - 1) * (FLOOR_HEIGHT + FLOOR_GAP) - building.height / 2 + FLOOR_HEIGHT / 2;

  const color = hasTag ? new Color(floorColor) : BASE_COLOR;

  return (
    <mesh position={[0, yOffset, 0]} castShadow receiveShadow>
      <boxGeometry args={[building.width - 0.05, FLOOR_HEIGHT - FLOOR_GAP, building.depth - 0.05]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={isSelectedBuilding ? (hasTag ? 0.85 : 0.3) : (hasTag ? 0.9 : 1)}
        emissive={hasTag ? floorColor : '#000000'}
        emissiveIntensity={hasTag ? 0.4 : 0}
        roughness={0.8}
        metalness={0.05}
      />
    </mesh>
  );
}

function CityBuilding({ building }: { building: Building }) {
  const [hovered, setHovered] = useState(false);
  const selectBuilding = useBuildingStore((s) => s.selectBuilding);
  const selectedId = useBuildingStore((s) => s.selectedBuildingId);
  const allTags = useBuildingStore((s) => s.tags);

  const tags: Tag[] = allTags.get(building.id) ?? [];
  const isSelected = selectedId === building.id;
  const state = getBuildingState(tags.length);
  const tasteColor = getBuildingColor(tags);

  const color = state === 'empty' ? BASE_COLOR : new Color(tasteColor);

  const geo = useMemo(
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

  const floors = Array.from({ length: building.levels }, (_, i) => i + 1);

  return (
    <group position={building.position}>
      {isSelected ? (
        // Selected: show individual floors
        <>
          {floors.map((f) => (
            <FloorMesh
              key={f}
              building={building}
              floor={f}
              tags={tags}
              isSelectedBuilding
            />
          ))}
          {/* Outer wireframe for the whole building */}
          <lineSegments>
            <edgesGeometry args={[geo]} />
            <lineBasicMaterial color={EDGE_COLOR} transparent opacity={0.2} />
          </lineSegments>
          {/* Per-floor edge lines */}
          {floors.map((f) => {
            const yOffset = (f - 1) * (FLOOR_HEIGHT + FLOOR_GAP) - building.height / 2 + FLOOR_HEIGHT / 2;
            return (
              <lineSegments key={`edge-${f}`} position={[0, yOffset, 0]}>
                <edgesGeometry
                  args={[new BoxGeometry(
                    building.width - 0.05,
                    FLOOR_HEIGHT - FLOOR_GAP,
                    building.depth - 0.05
                  )]}
                />
                <lineBasicMaterial color={EDGE_COLOR} transparent opacity={0.6} />
              </lineSegments>
            );
          })}
          {/* Selection indicator */}
          <mesh position={[0, building.height / 2 + 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.8, 1.0, 32]} />
            <meshBasicMaterial color="#ff9500" transparent opacity={0.6} side={2} />
          </mesh>
        </>
      ) : (
        // Not selected: solid building with taste color
        <>
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
              emissive={state === 'full' ? tasteColor : '#000000'}
              emissiveIntensity={state === 'full' ? 0.3 : 0}
              roughness={0.85}
              metalness={0.05}
            />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[geo]} />
            <lineBasicMaterial
              color={EDGE_COLOR}
              transparent
              opacity={hovered ? 0.6 : 0.4}
            />
          </lineSegments>
        </>
      )}
    </group>
  );
}

export function City() {
  const buildings = useBuildingStore((s) => s.buildings);
  const initCity = useBuildingStore((s) => s.initCity);

  useEffect(() => {
    if (buildings.length === 0) initCity();
  }, [buildings.length, initCity]);

  return (
    <group>
      {buildings.map((b) => (
        <CityBuilding key={b.id} building={b} />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#e8e4dc" roughness={1} />
      </mesh>
    </group>
  );
}
