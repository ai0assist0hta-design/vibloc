/**
 * Layered-PNG HEADZ avatar floating above a selected building's rooftop.
 *
 * This used to mount a Three.js GLB (head-only mesh exported from
 * Blender), but the GLB pipeline was fragile:
 *   • Hair meshes silently dropped when their visibility drivers
 *     said `hide_render=True` at export time
 *   • Eye materials inherited transparent shader nodes → invisible
 *   • Lighting/material debugging never ended
 *
 * NEW APPROACH: render the SAME layered PNG composite that the 2D
 * profile customizer uses, but as a flat texture inside a 3D
 * billboard. Result:
 *   • Identical look across rooftop / mypage / tagger card
 *   • Zero GLB loads, zero material/light debugging
 *   • Hair/glasses/hat all show because they're in the layer assets
 *   • Auto-faces the camera (true billboard, locks to camera basis)
 *
 * Sizing/lift logic preserved from the GLB version so existing
 * footprint→head-size feel is unchanged.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, type Group, type Mesh } from 'three';
import {
  avatarLayerUrl,
  rollAvatarForId,
  type VibAvatarConfig,
} from '../../features/avatar/avatarConfig';
import { useUserAvatar } from '../../features/avatar/useUserAvatar';
import {
  useTopTaggers,
  type TaggerGroup,
} from '../../lib/music/buildingPlaylist';
import type { OSMBuilding } from '../../lib/geo/osmLoader';

// Visible head-size band (world meters).
const HEAD_MIN_M = 5;
const HEAD_MAX_M = 50;

// Source PNG aspect (matches normalize_layers.py output: 256×280).
const TEX_W = 256;
const TEX_H = 280;
const TEX_ASPECT = TEX_W / TEX_H; // ≈ 0.914

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
    <RooftopAvatarInner
      building={selectedBuilding}
      taggerId={top.taggerId}
      groundY={groundY}
    />
  );
}

function RooftopAvatarInner({
  building,
  taggerId,
  groundY,
}: {
  building: OSMBuilding;
  taggerId: string;
  groundY?: ((x: number, z: number) => number) | null;
}) {
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
    const headW = targetHeadM * TEX_ASPECT;
    const liftAboveRoof = targetHeadM * 0.65;
    const groupY = roofY + liftAboveRoof;

    return { roofY, groupY, targetHeadM, headW };
  }, [building, groundY]);

  // Saved customizer config or deterministic fallback.
  const saved = useUserAvatar(taggerId);
  const config = useMemo<VibAvatarConfig>(() => {
    return saved ?? rollAvatarForId(taggerId);
  }, [saved, taggerId]);

  // Composite all layer PNGs into a single CanvasTexture so the
  // billboard renders one quad. Re-runs whenever the config changes.
  const texture = useLayeredAvatarTexture(config);

  // Idle bob — subtle vertical sway proportional to head size.
  const grpRef = useRef<Group | null>(null);
  useFrame(({ clock }) => {
    if (!grpRef.current) return;
    const t = clock.elapsedTime;
    grpRef.current.position.y = sizing.groupY + Math.sin(t * 1.6) * (sizing.targetHeadM * 0.04);
  });

  if (!texture) return null;

  return (
    <group ref={grpRef} position={[building.center[0], sizing.groupY, building.center[1]]}>
      <Billboard follow lockX lockZ>
        <mesh>
          <planeGeometry args={[sizing.headW, sizing.targetHeadM]} />
          <meshBasicMaterial
            map={texture}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

/** Build a single canvas texture from the avatar's stacked PNG
 *  layers. Returns null until images load. Re-renders when config
 *  changes (the deps key dedupes by content, not object identity). */
function useLayeredAvatarTexture(config: VibAvatarConfig): CanvasTexture | null {
  const key = JSON.stringify({
    base: config.base,
    hair: config.hair ?? null,
    glasses: config.glasses ?? null,
    hat: !!config.hat,
    earrings: !!config.earrings,
    beard: config.beard ?? null,
    mustache: config.mustache ?? null,
  });

  const [tex, setTex] = useState<CanvasTexture | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Layer URLs in z-order (bottom → top).
    const urls: string[] = [];
    urls.push(avatarLayerUrl(config.base, 'base')!);
    if (config.beard)    urls.push(avatarLayerUrl(config.base, 'beard',    config.beard)!);
    if (config.mustache) urls.push(avatarLayerUrl(config.base, 'mustache', config.mustache)!);
    if (config.hair)     urls.push(avatarLayerUrl(config.base, 'hair',     config.hair)!);
    if (config.earrings) urls.push(avatarLayerUrl(config.base, 'earrings')!);
    if (config.glasses)  urls.push(avatarLayerUrl(config.base, 'glasses',  config.glasses)!);
    if (config.hat)      urls.push(avatarLayerUrl(config.base, 'hat')!);

    Promise.all(urls.map((u) => loadImage(u))).then((imgs) => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = TEX_W;
      canvas.height = TEX_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      for (const img of imgs) {
        if (!img) continue;
        ctx.drawImage(img, 0, 0, TEX_W, TEX_H);
      }
      const t = new CanvasTexture(canvas);
      t.needsUpdate = true;
      // Color space — match the rest of the scene (sRGB).
      t.colorSpace = 'srgb' as never;
      setTex((prev) => {
        prev?.dispose();
        return t;
      });
    }).catch(() => { /* missing layer — ignore, partial composite is fine */ });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => { tex?.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return tex;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
