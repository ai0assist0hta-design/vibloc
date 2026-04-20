# HEADZ `.blend` File Analysis

Comprehensive audit of the 6 source files shipped with the HEADZ pack
(`/AVATAR FILE/Source_Files/`). Captured via Blender headless Python
on 2026-04-19. Drives the assumptions baked into
`scripts/headz/export-head.py` and `src/features/avatar/AvatarMesh.tsx`.

## TL;DR

- The pack ships **6 .blend files** but only **4 unique characters**
  (Brown == Black duplicate for both genders).
- Each file contains the **canonical character** + **leftover meshes**
  from other characters (artist's copy-paste residue from the original
  build). Naïve "export everything starting with `Geo_`" pulls those
  leftovers in and ruins the GLB.
- The canonical character is identified by the **armature name**
  (`rig-female_white`, `rig-male_black`, etc.).
- Some utility meshes (`Cartoony Eyes`, `Ears`, `Tongue`, `Cartoon
  Teeth`) are SHARED across characters and only ever named with one
  character's prefix — they MUST be allowed regardless of prefix or
  the head ends up with no eyes / no ears.
- Each file carries **26 pose actions** at frame 72 (e.g. `pose 10
  (smiling)`). Pose 1 has a typo ("opne mouth") in 4 of the 6 files.
- Each file has 28-30 named materials; eye rendering is split across
  5 materials (`white_eyes`, `iris_color`, `lens`, `pupil_black`,
  `mouth`) so material-level skin/eye recolor is feasible later.

---

## File ↔ Character map

| File | Armature | Canonical char | # meshes | Notable extras |
|------|----------|----------------|---------:|----------------|
| `Female - Source files/White.blend` | `rig-female_white` | **Female_White** | 23 | — |
| `Female - Source files/Brown.blend` | `rig-female_black` | **Female_Black** (Brown is a Black DUP) | 20 | has `Necklace` |
| `Female - Source files/Black.blend` | `rig-female_black` | **Female_Black** (identical to Brown) | 20 | has `Necklace` |
| `Source files/White.blend`           | `rig-male_white`   | **Male_White** | 34 | beard, mustache, Hair011 (84k), Space_helmet (16k) |
| `Source files/Brown.blend`           | `rig-male_black`   | **Male_Black** (Brown is a Black DUP) | 30 | has `Eyelashes` |
| `Source files/Black.blend`           | `rig-male_black`   | **Male_Black** (identical to Brown) | 30 | has `Eyelashes` |

The "Source files" folder name (no "Male - ") is a quirk of the pack
— it's the male source folder.

## Per-file mesh inventory (canonical characters only)

### Female White (23 character meshes + 4 utility)

```
Body          2893v  default visible          [ARMATURE, SUBSURF]
Cartoony Eyes.L/R  275v + 275v  visible       [LATTICE/ARMATURE/SUBSURF]
Eyebrow        200v  visible                  [ARMATURE, SUBSURF]
Eyes          1028v  HIDDEN (alt sclera)      [ARMATURE, NODES]
Earrings      1152v  HIDDEN
Glasses.001/2/3   ~450v each, all HIDDEN
Hair.001..010 (10 styles, .005 default)
Hat            209v  HIDDEN
Mask           548v  HIDDEN  [SOLIDIFY]
Lower/Upper Teeth (alt high-poly, hidden)
+ Female_white_Cartoon Lower/Upper Teeth (low-poly visible) — utility
+ Male_White_Ears (574v) + Male_White_Tongue (66v) — utility
```

### Female Black (20 character meshes + 8 utility)

Same layout as Female White EXCEPT:
- **No own Cartoony Eyes** — uses Male_White's as utility (positioned
  for male, slightly off on female face but acceptable)
- **Has `Necklace` (588v)** — Female White doesn't have one
- Default visible hair is `.010` (not `.005`)
- Pose 5 is `winking eye` (Female White's pose 5 is `smiling teeth` —
  the pack has inconsistent pose numbering between files!)

### Male White (34 character meshes — RICHEST file)

```
Body          2863v  visible  + 16 MASK modifiers (!) for hiding parts
Cartoony Eyes.L/R     visible
Eyebrow        252v  visible
Eyes          1348v  HIDDEN (alt sclera)
Glasses.001/2/3
Hair.001..009 (NO .010), plus Hair011 (84k) + Hair012 (2.6k)
                                             ^^^ AR-grade, dropped at export
Hat 590v + Hat 2 (no Geo_ prefix, 640v) — both hidden
Beard01 (46v), Beard02 (12k AR-grade), Beard03 (392v)
Moustache1 (20v artist placeholder), Mustache.001/2/3 (proper set)
Ring (56v) — HIDDEN
Space_helmet (16k AR-grade) — HIDDEN
Lower/Upper Teeth (alt)
Tongue
+ Male_white Cartoon Lower/Upper Teeth — utility
```

### Male Black (30 character meshes + 4 leftover Male_White)

```
Body          2847v  visible  + 16 MASK modifiers
Cartoon Lower/Upper Teeth (in-character, not utility this time)
Cartoony Eyes.L/R
Ears, Eyebrow, Eyelashes (128v)  ← exclusive to Male_Black
Eyes (1092v alt)
Glasses.001/2/3
Hair.001/.002/.003.001/.003.002/.004..009 (note: split .003 variants)
Hair 10 (no Geo_ prefix), Moustache 4 (no Geo_ prefix)
Hat (590v), Mask (548v)
Lower/Upper Teeth (alt)
Mustache.001/2/3, Ring
Tongue
+ Male_White Beard01, Beard02, Hair011, Space_helmet — leftover
```

## Mesh categories

### Always-on (face anatomy)
- `Body` — head shell (after we slice at neck plane Z=1.30)
- `Eyebrow`
- `Eyes` — sclera base (white of the eye)
- `Cartoony Eyes.L/R` — iris + pupil decal overlay
- `Ears`

### Pose-dependent (we hide for `pose 10 (smiling)`)
- `Cartoon Lower/Upper Teeth`
- `Lower/Upper Teeth` (alt)
- `Tongue`

### Variants (runtime-toggled by `VibAvatarConfig`)
- `Hair.001..010` (Female) / `Hair.001..009` + .003.001/.002 (Male)
- `Glasses.001..003`
- `Hat`
- `Earrings` (Female only)
- `Beard01/02/03` (Male_White only)
- `Mustache.001..003` (Male only)
- `Eyelashes` (Male_Black only — currently unused)
- `Necklace` (Female_Black only — currently unused)

### Heavy / AR-grade (auto-skipped at export, > 5000 verts)
- `Beard02` (12,416 verts)
- `Hair011` (84,362 verts!)
- `Hair.002/.003/.008` Female (4-7k verts) — partial heavy hair
- `Space_helmet` (16,400 verts)

### Junk / placeholder (always hidden)
- `Moustache1` (20v artist placeholder)
- `Hat 2` (no `Geo_` prefix)
- `Hair 10`, `Moustache 4` (no `Geo_` prefix in Male Black)
- `Ring`
- `Mask` / `Masker` (we don't expose; outbreak-mask aesthetic)

## Pose actions

26 actions per file, all stored at frame **72**. Names are inconsistent
between files (typos, capitalization differs):

```
pose 1(open mouth)      | "pose 1 (opne mouth)" in Female Brown/Black
pose 2 (smiling looking up)
pose 3 (smiling looking down)
pose 4 (crying face)
pose 5 (smiling teeth)  | "pose 5 (winking eye)" in Female Brown/Black/Male
pose 6 (smiling teeth)
pose 7 (flat face)
pose 8 (surprised)
pose 9 (smiling open)
pose 10 (smiling)       ← what we currently bake into the GLB
pose 11(angry)
pose 12(bro fist)
pose 13(call me)
pose 14(gossip)
Pose 15(hey!)
Pose 16(hugging)
pose 17(idea)
pose 18(in love)
pose 19(meditate)
pose 20 (namaste)
pose 21 (Peace)
pose 22(raised hand)
pose 23 (scared)
pose 24(showing right)
pose 25(thinking)
pose 26(thumbs up)
```

The "pose name" lookup in `export-head.py` is case-insensitive
substring match for resilience.

## Materials

Each character file ships ~28-30 named materials. Eye rendering is
split into 5 separate materials per character:

```
mat_<char>_white_eyes        ← sclera tint
mat_<char>_eyes_iris_color   ← iris hue (the future P2 color picker)
mat_<char>_eyes_lens         ← clear lens overlay
mat_<char>_eyes_pupil_black  ← pupil tint
mat_<char>_mouth             ← lip color (only material with a texture!)
```

Plus per-feature materials (`hairs`, `hat_strap`, `glasses_*_frame`,
`gums`, `teeth`, `body_skin`, etc.). All are pure-color/Principled BSDF
without textures EXCEPT `mat_<char>_mouth` which has a texture.

This means:
- Material-color recolor (P2) is straightforward — change the BSDF base
  color uniform per material, no texture rebuild.
- The `mouth` material's texture is the only piece tied to the .blend
  → can't be easily recolored without re-baking.

## Modifier stack

Most meshes use:
```
ARMATURE → SUBSURF
```

Some specials:
- `Body` (Male White, Male Black): **16 MASK modifiers** stacked!
  These hide body regions per pose. Our slice + `export_apply=True`
  bakes the result.
- `Hair.NNN`: many use `SOLIDIFY` for thickness, some use `NODES`
  (geometry nodes for hair strand generation).
- `Mask`: `SOLIDIFY + SUBSURF + NODES`.
- `Eyes` (alt): `NODES` for the iris pattern generator.

`export_apply=True` at GLB export collapses the entire modifier stack
to baked geometry — that's why our 1MB-of-Geometry-Nodes hair ends up
as a fixed-poly mesh in the GLB.

## Collections

Each file groups objects into:
- `Female White` / `Female Black` / etc. (the canonical character)
- `Hair` (10 hair variants)
- `Head` (4 head-related objects)
- `Accessories` (6-9 items)
- `Lattice` (2 — eye deform lattices)
- `Modifications` (7 — shape-keyed expression deformers)
- `SHAPE KEYS` (7-8 — face shape morphs)
- `Tears` (4 — pose 4 crying-face props)
- `Widgets` (146-147 — rig control display objects)

## Implications baked into our pipeline

### Export script (`scripts/headz/export-head.py`)
1. Detect canonical character via armature name (`rig-<char>`).
2. Filter exported meshes:
   - **character-specific** (Body, Eyebrow, Hair, Glasses, Hat, Mask,
     Earrings, Necklace, Beard, Mustache, Eyelashes) → must match the
     canonical prefix.
   - **utility** (Cartoony Eyes, Ears, Tongue, Cartoon Teeth, alt
     Lower/Upper Teeth) → allowed regardless of prefix.
3. Drop `.NNN` suffixes ONLY if the unsuffixed base also exists in the
   file (true high-poly subdivision dupe).
4. Drop any single mesh > 5,000 verts (AR-grade variants we don't ship).
5. Slice `Body` at world Z=1.30 to keep just the head + neck.
6. Apply the requested pose action at frame 72 → bake via
   `export_apply=True` + `export_skins=False`.
7. Draco-compress (level 6).

### App side (`src/features/avatar/AvatarMesh.tsx`)
1. Strip the `Geo_<char>_` prefix with a case-insensitive regex so
   the after-string is a stable name regardless of which file the
   mesh came from.
2. Maintain a hand-curated `isPartVisible(name, config)` table with:
   - always-on parts (Body, Eyes, Cartoony Eyes, Eyebrow, Ears)
   - pose-dependent (teeth/tongue hidden for the smile pose we ship)
   - variant slots driven by `VibAvatarConfig`
   - never-on (Mask, Ring, Space_helmet, Hat 2, Moustache1)
3. Swap the `Cartoony Eyes` material to `MeshBasicMaterial` so the
   iris decal stays a flat painted artwork, not a glossy decal.
4. Render through `AVATAR_LAYER` (Three.js render layer 2) so the
   world's directional sun never hits the avatar — local soft
   lighting only.

### Distribution
- 4 GLB files (`f-white`, `f-black`, `m-white`, `m-black`), ~120-190 KB
  each Draco-compressed. Total ~590 KB preloaded at app start.
- `f-brown` / `m-brown` URLs are migrated to `*-black` via
  `normaliseBase()` in `avatarConfig.ts` (legacy localStorage values
  from before the audit).

## Ideas for future accuracy

| Idea | Effort | Win |
|------|--------|-----|
| Per-character pose mapping (some look better in pose 7 vs 10) | small | better default expression |
| Material-uniform color picker (P2 customizer) | medium | unique skin / hair colors per user |
| Re-bake mouth texture per skin tone | small | keeps lip color in sync when we tint skin |
| Detect `MASK` modifier groups on Body and expose per-region toggle | medium | partial-face hide effects (cap, half-mask) |
| Export Necklace + Eyelashes as additional toggle slots | small | more variation for Female_Black + Male_Black |
| Replace neck-slice with a proper Blender bone-driven hide | medium | cleaner cap, no risk of awkward frustum from below |
| Embed all 26 poses as glTF morph targets | large | runtime expression switching |
