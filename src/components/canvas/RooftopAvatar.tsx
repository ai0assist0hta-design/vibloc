/**
 * 3D HEADZ avatar floating above a selected building's rooftop.
 *
 * Uses head-only GLBs exported by `scripts/headz/export-head.py`
 * (Body sliced at the neck). Each GLB ships ALL hair / glasses /
 * hat / earrings / beard / mustache variants — `<AvatarMesh>`
 * toggles per-mesh `.visible` based on the user's saved config so
 * customizer changes appear instantly without re-fetching anything.
 *
 * Why GLBs and not the layered PNG composite?
 *   • Real depth + parallax — the head reads as a 3D head, not a
 *     sticker on a quad.
 *   • Camera-locked Y-billboard so the face always greets the user.
 *   • Avatar lights live on a dedicated layer so the world's harsh
 *     directional sun never crosses onto the cartoon face.
 */

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Billboard } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group, Light } from 'three';
import { AvatarMesh, AVATAR_LAYER } from '../../features/avatar/AvatarMesh';
import { rollAvatarForId, type VibAvatarConfig } from '../../features/avatar/avatarConfig';
import { useUserAvatar } from '../../features/avatar/useUserAvatar';
import {
  useTopTaggers,
  type TaggerGroup,
} from '../../lib/music/buildingPlaylist';
import type { OSMBuilding } from '../../lib/geo/osmLoader';

// HEADZ head-model anatomy (world units after the neck-cut export)
const HEAD_NECK_Y   = 1.30;
const HEAD_CROWN_Y  = 1.62;
const HEAD_CENTER_Y = (HEAD_NECK_Y + HEAD_CROWN_Y) / 2;        // ≈ 1.46
const HEAD_HEIGHT   = HEAD_CROWN_Y - HEAD_NECK_Y;              // ≈ 0.32

// Visible head size band (world meters) — driven by the building.
const HEAD_MIN_M = 5;
const HEAD_MAX_M = 50;

type Props = {
  selectedBuilding: OSMBuilding | null;
  /** Optional ground sampler — `(x, z) => groundY`. */
  groundY?: ((x: number, z: number) => number) | null;
};

export function RooftopAvatar({ selectedBuilding, groundY }: Props) {
  const taggers = useTopTaggers(selectedBuilding?.id ?? '__none__', 1);
  const top: TaggerGroup | null = taggers[0] ?? null;
  if (!selectedBuilding || !top) return null;
  return (
    <Suspense fallback={null}>
      <RooftopAvatarInner
        building={selectedBuilding}
        taggerId={top.taggerId}
        groundY={groundY}
      />
    </Suspense>
  );
}

/** Helper: pin a light to AVATAR_LAYER so it ONLY illuminates avatar
 *  meshes — the city stays under its own world directional sun. */
const onLightRef = (l: Light | null) => { if (l) l.layers.set(AVATAR_LAYER); };

function RooftopAvatarInner({
  building,
  taggerId,
  groundY,
}: {
  building: OSMBuilding;
  taggerId: string;
  groundY?: ((x: number, z: number) => number) | null;
}) {
  // Make sure the camera renders the avatar layer too.
  const { camera } = useThree();
  useEffect(() => {
    camera.layers.enable(AVATAR_LAYER);
  }, [camera]);

  const sizing = useMemo(() => {
    const fp = building.footprint;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of fp) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const fw = Math.max(1, maxX - minX);
    const fd = Math.max(1, maxZ - minZ);

    const ground = groundY ? groundY(building.center[0], building.center[1]) : 0;
    const roofY = ground + Math.max(building.height, 6);

    const sizeDriver = Math.max(
      Math.min(fw, fd) * 0.40,
      Math.max(building.height, 0) * 0.12,
    );
    const targetHeadM = Math.max(HEAD_MIN_M, Math.min(HEAD_MAX_M, sizeDriver));
    const SCALE = targetHeadM / HEAD_HEIGHT;

    const headRadiusM = targetHeadM / 2;
    const liftAboveRoof = headRadiusM + targetHeadM * 0.25;
    const groupY = roofY + liftAboveRoof;

    return { roofY, groupY, SCALE, targetHeadM };
  }, [building, groundY]);

  // Idle bob — proportional to head size so it reads consistently.
  const grpRef = useRef<Group | null>(null);
  useFrame(({ clock }) => {
    if (!grpRef.current) return;
    const t = clock.elapsedTime;
    grpRef.current.position.y = sizing.groupY + Math.sin(t * 1.6) * (sizing.targetHeadM * 0.04);
  });

  // Saved customizer config or deterministic fallback. Layered PNG
  // schema fields (hair/glasses/hat/earrings/beard/mustache) are
  // identical to what AvatarMesh.isPartVisible() reads, so the GLB
  // shows the SAME look the user picked in the editor.
  const saved = useUserAvatar(taggerId);
  const config = useMemo<VibAvatarConfig>(() => {
    const picked = saved ?? rollAvatarForId(taggerId);
    return {
      base: picked.base,
      pose: picked.pose,
      hair: picked.hair ?? 5,
      glasses: picked.glasses ?? null,
      hat: picked.hat ?? false,
      earrings: picked.earrings ?? false,
      beard: picked.beard ?? null,
      mustache: picked.mustache ?? null,
    };
  }, [saved, taggerId]);

  // Light positions scale with head size for consistent falloff.
  const L = sizing.targetHeadM;
  return (
    <group ref={grpRef} position={[building.center[0], sizing.groupY, building.center[1]]}>
      {/*
        ── Local studio lighting (Memoji-style) ──
        These lights live on AVATAR_LAYER only. The world's harsh
        directional sun stays on layer 0 → it never hits the avatar
        and never casts the cross-eye / dark-eye-socket shadow.
      */}
      <ambientLight ref={onLightRef} intensity={0.55} color="#ffffff" />
      <hemisphereLight ref={onLightRef} args={['#ffffff', '#cdd5e3', 0.45]} />
      <pointLight
        ref={onLightRef}
        position={[L * 0.9, L * 1.2, L * 1.1]}
        intensity={L * L * 1.4}
        distance={L * 6}
        decay={1.6}
        color="#fff5e6"
      />
      <pointLight
        ref={onLightRef}
        position={[-L * 0.9, L * 0.8, L * 0.8]}
        intensity={L * L * 0.7}
        distance={L * 6}
        decay={1.6}
        color="#dde9ff"
      />
      <pointLight
        ref={onLightRef}
        position={[0, L * 0.7, -L * 1.2]}
        intensity={L * L * 0.5}
        distance={L * 5}
        decay={1.6}
        color="#ffffff"
      />

      {/*
        Billboard rotates only around Y (lockX, lockZ) so the head
        stays upright while always facing the camera. Inside, scale
        the model and shift down by HEAD_CENTER_Y so the head's
        visual centre sits at the group origin.
      */}
      <Billboard follow lockX lockZ>
        <group scale={sizing.SCALE}>
          <group position={[0, -HEAD_CENTER_Y, 0]}>
            <AvatarMesh config={config} />
          </group>
        </group>
      </Billboard>
    </group>
  );
}
