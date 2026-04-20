/**
 * Reusable Three.js group that renders a HEADZ avatar from a config.
 *
 * The same `<AvatarMesh config={...} />` is used by every 3D surface
 * (rooftop floater, mypage hero, future customizer preview) so the
 * character looks identical everywhere. drei's `useGLTF` caches the
 * loaded scene, so mounting the same base in 5 places downloads the
 * GLB once.
 *
 * P1: only loads the base GLB. P2 (color tuning) and P3 (modular
 * accessories) will add layered material / mesh swaps here without
 * changing the public API.
 */

import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { MeshBasicMaterial } from 'three';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { avatarGlbUrl, AVATAR_BASES } from './avatarConfig';
import type { VibAvatarConfig } from './avatarConfig';

/** Render layer reserved for HEADZ avatars. World lights stay on the
 *  default layer 0; avatar-local lights live on this layer. The
 *  avatar is invisible to world lighting and the world is invisible
 *  to avatar lights → cartoon faces never get harsh sun shadows on
 *  the eyes. The camera enables BOTH layers so the user sees both. */
export const AVATAR_LAYER = 2;

type Props = {
  config: VibAvatarConfig;
};

export function AvatarMesh({ config }: Props) {
  const { scene } = useGLTF(avatarGlbUrl(config.base)) as unknown as { scene: Group };
  // Clone so the same cached scene can render in N positions
  // simultaneously without sharing transform state. Also:
  //   • move every node onto AVATAR_LAYER so world lights skip it
  //   • disable shadow cast/receive (cartoon faces shouldn't catch
  //     the sun's hard shadow at all)
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    // Per-mount log opt-in: noisy because each editor click rebuilds
    // the clone. Set `localStorage.vibloc.avatarDebug = '1'` in the
    // browser to enable.
    const dev = import.meta.env.DEV
      && typeof window !== 'undefined'
      && window.localStorage?.getItem('vibloc.avatarDebug') === '1';
    const visibleNames: string[] = [];
    const hiddenNames: string[] = [];
    c.traverse((obj) => {
      obj.layers.set(AVATAR_LAYER);
      const m = obj as Mesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      m.receiveShadow = false;

      // ── Variant visibility toggles ──
      // The GLB ships ALL hair / glasses / hat / beard / mustache /
      // earrings variants inside one file. Each user shows ONE
      // configuration — chosen here from `config` — and everything
      // else is hidden. This is the runtime customizer hook (P3 just
      // changes the config; no re-export needed).
      const v = isPartVisible(m.name, config);
      m.visible = v;
      if (dev) (v ? visibleNames : hiddenNames).push(m.name);

      // ── Iris decals: opt out of lighting ──
      // Two-mesh eye system in HEADZ:
      //   • `Eyes` (white sclera mesh)  → keep MeshStandardMaterial
      //     so it gets soft round shading from our local lights
      //   • `Cartoony Eyes.L/R` (iris/pupil decals on top) → swap to
      //     MeshBasicMaterial so the iris colors stay clean
      //
      // Defensive: FORCE opacity=1 + transparent=false on the swap.
      // Some HEADZ source materials report opacity=0 / transparent=
      // true (driven by shader nodes that we don't carry over), and
      // a literal copy used to make the irises invisible. We always
      // want them shown.
      const after = m.name.replace(/^Geo_(Female|Male)_(white|brown|black)_/i, '');
      const isEye = /^Cartoony Eyes\.[LR]$/.test(after);
      if (isEye) {
        const old = m.material as MeshStandardMaterial | MeshStandardMaterial[];
        const swapOne = (orig: MeshStandardMaterial) =>
          new MeshBasicMaterial({
            color: orig.color,
            map: orig.map,
            side: orig.side,
            toneMapped: false,
            transparent: false,
            opacity: 1,
          });
        m.material = Array.isArray(old) ? old.map(swapOne) : swapOne(old);
      }

      // Defensive: force the white-sclera mesh to be opaque too —
      // its shader-node setup in the original .blend can carry an
      // alpha value of 0 that has the same effect as the iris case.
      const isSclera = /^Eyes$/.test(after);
      if (isSclera) {
        const fix = (mat: MeshStandardMaterial) => {
          mat.transparent = false;
          mat.opacity = 1;
          mat.depthWrite = true;
          mat.needsUpdate = true;
        };
        const cur = m.material as MeshStandardMaterial | MeshStandardMaterial[];
        if (Array.isArray(cur)) cur.forEach(fix); else fix(cur);
      }
    });
    if (dev) {
      // eslint-disable-next-line no-console
      console.log('[Avatar]', config, '\n  ✓', visibleNames, '\n  ×', hiddenNames);
    }
    return c;
  }, [scene, config]);

  // Dispose the swapped MeshBasicMaterials when this clone is
  // replaced (config change → fresh useMemo) or the component
  // unmounts. The shared MeshStandardMaterials and geometries are
  // owned by drei's useGLTF cache so we don't touch them.
  useEffect(() => {
    return () => {
      cloned.traverse((obj) => {
        const m = obj as Mesh;
        if (!m.isMesh) return;
        const mat = m.material;
        if (mat instanceof MeshBasicMaterial) {
          mat.dispose();
        } else if (Array.isArray(mat)) {
          for (const sub of mat) if (sub instanceof MeshBasicMaterial) sub.dispose();
        }
      });
    };
  }, [cloned]);

  return <primitive object={cloned} />;
}

/** Decide whether a given GLB mesh should be visible for this config.
 *  Mesh names follow HEADZ patterns:
 *    Geo_..._Body                      → always visible (head)
 *    Geo_..._Cartoony Eyes.L/R         → always visible (eyes)
 *    Geo_..._Eyebrow                   → always visible
 *    Geo_..._Cartoon Lower/Upper Teeth → always visible (cartoon teeth)
 *    Geo_..._Lower Teeth / Upper Teeth → hidden (alt high-poly teeth)
 *    Geo_..._Tongue                    → always visible
 *    Geo_..._Ears                      → always visible
 *    Geo_..._Eyes                      → hidden (alt detailed eye set)
 *    Geo_..._Hair.NNN                  → only the chosen one shows
 *    Geo_..._Hair011 / Hair012         → treated as variants 11/12
 *    Geo_..._Glasses.NNN               → only the chosen one (or none)
 *    Geo_..._Hat                       → toggled by config.hat
 *    Geo_..._Mask / Masker             → never (worn only for masked
 *                                        outbreak look — distracting)
 *    Geo_..._Earrings                  → toggled by config.earrings
 *    Geo_..._BeardNN / Beard.NNN       → toggled by config.beard idx
 *    Geo_..._Mustache.NNN / MoustacheN → toggled by config.mustache idx
 *    Geo_..._Ring / Space_helmet       → never
 */
function isPartVisible(name: string, cfg: VibAvatarConfig): boolean {
  // Strip `Geo_<gender>_<tone>_` prefix once for cleaner matching.
  const after = name.replace(/^Geo_(Female|Male)_(white|brown|black)_/i, '');

  // ── Always-on base features ──
  // The canonical HEADZ render (see Pose 10 PNG) needs BOTH eye
  // meshes: `Eyes` is the white sclera+pupil base, `Cartoony Eyes`
  // sits on top as the iris/highlight overlay. Hiding `Eyes` (as
  // we did before) leaves only floating iris dots — looked broken.
  if (/^Body$/.test(after)) return true;
  if (/^Eyes$/.test(after)) return true;            // sclera base
  if (/^Cartoony Eyes\.[LR]$/.test(after)) return true; // iris overlay
  if (/^Eyebrow$/.test(after)) return true;
  if (/^Ears$/.test(after)) return true;

  // ── Pose-dependent parts ──
  // Pose 10 (smiling) uses closed lips. Any teeth/tongue meshes
  // would poke through the lips and look weird. Hide them while
  // we're locked to the smile pose. (P4 — when we let users pick
  // expressions — these will need to track the chosen pose.)
  if (/^(Cartoon )?(Lower|Upper) Teeth$/i.test(after)) return false;
  if (/^Tongue$/.test(after)) return false;

  // ── Never-on (alt / placeholder / accessory we don't expose) ──
  if (/^Eyebrow_\(backup\)/.test(after)) return false;
  if (/^Mask(er)?$/i.test(after)) return false;
  if (/^Ring$/.test(after)) return false;
  if (/^Space_helmet$/.test(after)) return false;
  if (/^Hat 2$/.test(after)) return false;
  // "Moustache1" (uppercase O, no period) is an artist placeholder
  // — only 20 verts, doesn't render correctly. We use the proper
  // "Mustache.001..003" set instead.
  if (/^Moustache\d+$/.test(after)) return false;

  // Hair: match Hair.NNN (1..12) or Hair011/Hair012
  const hairMatch = after.match(/^Hair\.0*(\d+)$/) || after.match(/^Hair0*(\d+)$/);
  if (hairMatch) {
    const idx = parseInt(hairMatch[1], 10);
    return cfg.hair === idx;
  }

  // Glasses: Glasses.001..003
  const glassesMatch = after.match(/^Glasses\.0*(\d+)$/);
  if (glassesMatch) {
    const idx = parseInt(glassesMatch[1], 10);
    return cfg.glasses === idx;
  }

  if (/^Hat$/.test(after)) return !!cfg.hat;
  if (/^Earrings$/.test(after)) return !!cfg.earrings;

  // Beard: BeardNN (no dot) — Beard01, Beard02, Beard03
  const beardMatch = after.match(/^Beard0*(\d+)$/);
  if (beardMatch) return cfg.beard === parseInt(beardMatch[1], 10);

  // Mustache: Mustache.001..003 OR MoustacheN
  const mustacheMatch =
    after.match(/^Mustache\.0*(\d+)$/) || after.match(/^Moustache0*(\d+)$/);
  if (mustacheMatch) return cfg.mustache === parseInt(mustacheMatch[1], 10);

  // Unknown / TEARS / etc → hide by default to avoid surprises.
  return false;
}

/** Preload all 6 base GLBs on app start — total ~1.2MB Draco. Lets
 *  the avatar pop in instantly the first time a building is selected. */
export function preloadAvatarBases(): void {
  for (const base of AVATAR_BASES) {
    useGLTF.preload(avatarGlbUrl(base));
  }
}
