/**
 * Single source-of-truth for a user's avatar appearance.
 *
 * Apple-Memoji-inspired structure: one config blob describes the
 * character so every surface (rooftop 3D, profile pin, playlist
 * detail header, mypage hero) renders identically from the same
 * data. P1 only uses `base`; P2/P3 will add color/parts fields here.
 *
 * HEADZ guardrails (do NOT relax without re-checking the license —
 * see docs/legal/headz-license.md):
 *   • No user-facing GLB download/export feature
 *   • No paywall on the site
 *   • Credit ThreeDee in README + footer
 */

// HEADZ .blend files contain 4 unique 3D character meshes (White +
// Black per gender — Brown.blend is a Black DUPLICATE per audit).
// HOWEVER the official PNG render sets DO ship 6 visually distinct
// characters: each Brown variant is rendered with its own outfit /
// hair / accessories that don't match the Black render. We expose
// all 6 to the PNG-based picker for maximum visual variety, and
// remap Brown → Black at the GLB layer (`avatarGlbUrl`) so the
// rooftop 3D pipeline still works without re-exporting duplicates.
export const AVATAR_BASES = [
  'f-white', 'f-brown', 'f-black',
  'm-white', 'm-brown', 'm-black',
] as const;

export type AvatarBase = (typeof AVATAR_BASES)[number];

/** True when this base only exists in PNG form (Brown). The GLB
 *  pipeline maps it to the equivalent Black mesh. */
export function isPngOnlyBase(b: AvatarBase): boolean {
  return b === 'f-brown' || b === 'm-brown';
}

/** HEADZ pose number (1..10) — each pose is a different face
 *  expression / outfit combination baked into the artist's render
 *  set. The official pack ships 10 poses per character. */
export type PoseId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export const POSES: PoseId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const POSE_LABELS: Record<PoseId, string> = {
  1: '입 벌림',
  2: '미소 (위)',
  3: '미소 (아래)',
  4: '울음',
  5: '윙크',
  6: '치아 미소',
  7: '무표정',
  8: '놀람',
  9: '입 살짝',
  10: '미소',
};

/** Legacy fields (hair / glasses / hat / etc.) kept optional for
 *  back-compat with previously-saved configs, but no longer drive
 *  the picker UI. The PNG-based avatar system locks the look to
 *  whatever the artist baked into each (base, pose) combination. */
/** Per-part toggles for the LAYERED PNG customizer. Each base ships
 *  baked layer PNGs at /avatars/layers/<base>/<part>.png that stack on
 *  top of base.png. Numeric IDs map to Hair.NNN / Glasses.NNN / etc.
 *  in the source .blend (1-indexed). null/undefined = part hidden. */
export type VibAvatarConfig = {
  base: AvatarBase;
  pose: PoseId;
  hair?: number | null;       // 1..10 (per-char availability varies)
  glasses?: number | null;    // 1..3
  hat?: boolean;
  earrings?: boolean;
  beard?: number | null;      // male only, 1..3
  mustache?: number | null;   // male only, 1..3
  skinHsl?: [number, number, number];
  hairHsl?: [number, number, number];
};

export const DEFAULT_AVATAR: VibAvatarConfig = {
  base: 'f-white',
  pose: 10,
  hair: 5,
};

/** Per-base availability of layer variants. Hand-curated from the
 *  bake output (see /tmp/headz-work/layers/<base>/web/). null entries
 *  mean the layer .png does not exist for that base. */
export const LAYER_AVAILABILITY: Record<AvatarBase, {
  hair: number[];
  glasses: number[];
  hat: boolean;
  earrings: boolean;
  beard: number[];
  mustache: number[];
}> = {
  'f-white': { hair: [1,2,3,4,5,6,7,8,9,10], glasses: [1,2,3], hat: true, earrings: true, beard: [], mustache: [] },
  'f-brown': { hair: [1,2,3,4,5,6,7,8,9,10], glasses: [1,2,3], hat: true, earrings: true, beard: [], mustache: [] },
  'f-black': { hair: [1,2,3,4,5,6,7,8,9,10], glasses: [1,2,3], hat: true, earrings: true, beard: [], mustache: [] },
  'm-white': { hair: [1,2,3,4,5,6,7,8,9],    glasses: [1,2,3], hat: true, earrings: false, beard: [1,2,3], mustache: [1,2,3] },
  'm-brown': { hair: [1,2,4,5,6,7,8,9],      glasses: [1,2,3], hat: true, earrings: false, beard: [],      mustache: [1,2,3] },
  'm-black': { hair: [1,2,4,5,6,7,8,9],      glasses: [1,2,3], hat: true, earrings: false, beard: [],      mustache: [1,2,3] },
};

/** URL of a single bakedlayer PNG for a (base, part) combo.
 *  Returns null when this base does not ship that variant. */
export function avatarLayerUrl(
  base: AvatarBase,
  layer: 'base' | 'hair' | 'glasses' | 'hat' | 'earrings' | 'beard' | 'mustache',
  index?: number | null,
): string | null {
  if (layer === 'base') return `/avatars/layers/${base}/base.png`;
  if (layer === 'hat') return `/avatars/layers/${base}/hat.png`;
  if (layer === 'earrings') return `/avatars/layers/${base}/earrings.png`;
  if (index == null) return null;
  return `/avatars/layers/${base}/${layer}-${index}.png`;
}

/** Defensive coercion. Accepts any string and returns a valid
 *  AvatarBase (falls back to f-white if unrecognised). Brown is now
 *  a first-class base so it passes through. */
export function normaliseBase(b: string): AvatarBase {
  return (AVATAR_BASES as readonly string[]).includes(b)
    ? (b as AvatarBase)
    : 'f-white';
}

/** Path on the static server for the 3D rooftop renderer. Brown
 *  bases are PNG-only — they re-use the Black GLB (geometry is
 *  identical per the .blend audit). */
export function avatarGlbUrl(base: AvatarBase): string {
  const glbBase = base === 'f-brown' ? 'f-black'
                : base === 'm-brown' ? 'm-black'
                : base;
  return `/models/headz/${glbBase}.glb`;
}

/** Pre-rendered PNG portrait — base only (pose 10 default). Cheap
 *  fallback when we don't yet know the pose. */
export function avatarThumbUrl(base: AvatarBase): string {
  return `/avatars/headz-thumbs/${base}.png`;
}

/** Pre-rendered PNG portrait per (base, pose) combo. 4 chars × 10
 *  poses = 40 frontal frames extracted from the official HEADZ
 *  render sets. The sole source of truth for the 2D avatar
 *  customizer — no Canvas / no GLB / no traversal needed. */
export function avatarPoseThumbUrl(base: AvatarBase, pose: PoseId): string {
  return `/avatars/headz-thumbs/${base}-pose${pose}.png`;
}

/** FNV-1a 32-bit hash with a salt — lets one id produce many
 *  independent random rolls (one per variant slot). */
function fnv1a(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Convenience: deterministic base picker for seed data. */
export function pickBaseForId(id: string): AvatarBase {
  return AVATAR_BASES[fnv1a(id, 1) % AVATAR_BASES.length];
}

/** Roll a complete random VibAvatarConfig for any string id.
 *  Same id → same look forever. PNG-based system: only base + pose
 *  drive the visual; the .NNN GLB-variant fields are kept on the
 *  type for back-compat but ignored at render time. */
export function rollAvatarForId(id: string): VibAvatarConfig {
  const base = pickBaseForId(id);
  const POSE_WEIGHTS: PoseId[] = [10, 10, 10, 7, 2, 5, 5, 6, 9, 3];
  const pose = POSE_WEIGHTS[fnv1a(id, 11) % POSE_WEIGHTS.length];
  const avail = LAYER_AVAILABILITY[base];
  const pick = <T,>(arr: T[], salt: number): T | null =>
    arr.length ? arr[fnv1a(id, salt) % arr.length] : null;
  // Most users always wear hair. ~75% wear glasses 0/no, etc.
  const wearGlasses = (fnv1a(id, 21) % 100) < 30;
  const wearHat = (fnv1a(id, 22) % 100) < 18;
  const wearEarrings = avail.earrings && (fnv1a(id, 23) % 100) < 35;
  const wearBeard = avail.beard.length && (fnv1a(id, 24) % 100) < 40;
  const wearMustache = avail.mustache.length && (fnv1a(id, 25) % 100) < 25;
  return {
    base, pose,
    hair: pick(avail.hair, 31) ?? null,
    glasses: wearGlasses ? pick(avail.glasses, 32) : null,
    hat: wearHat,
    earrings: wearEarrings,
    beard: wearBeard ? pick(avail.beard, 33) : null,
    mustache: wearMustache ? pick(avail.mustache, 34) : null,
  };
}
