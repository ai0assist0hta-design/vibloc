/**
 * 3D HEADZ avatar floating above a selected building's rooftop.
 *
 * Uses the head-only GLBs exported by `scripts/headz/export-head.py`
 * (Body mesh sliced at the neck — no torso, no arms, no hands).
 *
 * Model space (after Blender → glTF Y-up conversion):
 *   • Y_neck   ≈ 1.30   (cut plane, bottom of the floating head)
 *   • Y_head_center ≈ 1.46
 *   • Y_crown  ≈ 1.62   (top of skull, or hair if added)
 *   • Total visible head height ≈ 0.32 model units
 *
 * We:
 *   1. Compute a target visible head size in WORLD METERS based on
 *      the building's footprint (small shop → smaller head, stadium
 *      → bigger head). Clamped so it's always readable.
 *   2. Derive uniform scale = target / 0.32.
 *   3. Position the avatar group so the HEAD CENTER sits a few
 *      meters above the rooftop (lift = head_radius + clearance).
 *      Inner translate -1.46 puts the model's head-center at the
 *      group origin → Billboard rotates around the visual centre.
 *   4. Idle bob (sin) on the outer group for a "alive" feel.
 *   5. Billboard wrapper (lockX/Z, rotates around Y only) so the
 *      face always greets the camera no matter where the user
 *      orbits.
 *
 * Visibility:
 *   • Renders only when a building is selected AND it has a
 *     qualifying TOP-1 curator.
 *   • Suspends invisibly while the GLB downloads (drei useGLTF).
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
const HEAD_NECK_Y   = 1.30; // cut plane
const HEAD_CROWN_Y  = 1.62; // top of skull
const HEAD_CENTER_Y = (HEAD_NECK_Y + HEAD_CROWN_Y) / 2;        // ≈ 1.46
const HEAD_HEIGHT   = HEAD_CROWN_Y - HEAD_NECK_Y;              // ≈ 0.32

// Target visible head size band (world meters). The actual size is
// derived from BOTH the building's footprint AND height — so a tall
// slim tower still gets a substantial head, while a tiny shop gets
// a tiny head that doesn't engulf the building.
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

/** Helper: when assigned to a light's `ref`, sticks the light onto
 *  AVATAR_LAYER so it ONLY illuminates avatar meshes and never bleeds
 *  onto the city. */
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
  // Make sure the camera renders the avatar layer (default cameras
  // only render layer 0). One-time setup; idempotent.
  const { camera } = useThree();
  useEffect(() => {
    camera.layers.enable(AVATAR_LAYER);
  }, [camera]);

  // Footprint-driven head sizing (in world meters).
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

    // Visible head height — driven by BOTH the building's narrowest
    // footprint side AND its height, so:
    //   • tiny shop (10×5m)         → ~5m head (clamped at floor)
    //   • mid block (40×30m)        → ~16m head
    //   • tall slim tower (30×200m) → ~24m head (height kicks in)
    //   • wide low slab (100×30m)   → ~40m head
    //   • massive complex           → 50m head (clamped at ceiling)
    const sizeDriver = Math.max(
      Math.min(fw, fd) * 0.40,         // 40% of narrowest side
      Math.max(building.height, 0) * 0.12,  // or 12% of height
    );
    const targetHeadM = Math.max(HEAD_MIN_M, Math.min(HEAD_MAX_M, sizeDriver));
    const SCALE = targetHeadM / HEAD_HEIGHT;

    // Lift: head bottom sits ~ a quarter-head above the rooftop, so
    // there's a bit of breathing room without the head floating off
    // into space.
    const headRadiusM = targetHeadM / 2;
    const liftAboveRoof = headRadiusM + targetHeadM * 0.25;
    const groupY = roofY + liftAboveRoof;

    return { roofY, groupY, SCALE, targetHeadM };
  }, [building, groundY]);

  // Idle bob on the outer group. Amplitude scaled to head size so
  // the motion reads consistently regardless of zoom level.
  const grpRef = useRef<Group | null>(null);
  useFrame(({ clock }) => {
    if (!grpRef.current) return;
    const t = clock.elapsedTime;
    grpRef.current.position.y = sizing.groupY + Math.sin(t * 1.6) * (sizing.targetHeadM * 0.04);
  });

  // If THIS tagger is a real user with a saved customizer config,
  // use it. Otherwise fall back to the deterministic roll so seeded
  // demo curators still look distinct. Subscribes via useUserAvatar
  // so any save in /mypage instantly reflects on the rooftop.
  //
  // The PNG-based customizer only stores `base` + `pose`. For the 3D
  // rooftop we layer hardcoded sensible defaults on top so every
  // character renders complete (Hair.005 fits all 4 bases per the
  // .blend audit; verified Eyes + Cartoony Eyes + Eyebrow + Ears
  // are present for every base).
  const saved = useUserAvatar(taggerId);
  const config = useMemo<VibAvatarConfig>(() => {
    const picked = saved ?? rollAvatarForId(taggerId);
    return {
      base: picked.base,
      pose: picked.pose,
      hair: picked.hair ?? 5,
      glasses: picked.glasses ?? 0,
      hat: picked.hat ?? false,
      earrings: picked.earrings ?? false,
      beard: picked.beard ?? 0,
      mustache: picked.mustache ?? 0,
    };
  }, [saved, taggerId]);

  // Light positions scale with the head so distance-based falloff
  // stays consistent regardless of which building was selected.
  const L = sizing.targetHeadM;
  return (
    <group ref={grpRef} position={[building.center[0], sizing.groupY, building.center[1]]}>
      {/*
        ── Local studio lighting (Memoji-style) ──
        These lights live on AVATAR_LAYER only. The world's harsh
        directional sun stays on layer 0 → it never hits the avatar
        and never casts the cross-eye / dark-eye-socket shadow that
        was making the face look weird.

        Three-point recipe:
          • Ambient base — fills shadow side so eyes never go pure black
          • Hemisphere — soft sky/ground gradient, gives subtle dimension
          • Key (front-upper-right) — main warm highlight on the face
          • Fill (front-upper-left) — cool, half intensity, lifts shadows
          • Rim (back-above)        — quarter intensity, separates from BG
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
        stays upright while always greeting the camera. Inside the
        billboard, the model is scaled and shifted DOWN by the
        head-centre offset so the head's visual center sits exactly
        at the group origin — Billboard rotates around that center.
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
