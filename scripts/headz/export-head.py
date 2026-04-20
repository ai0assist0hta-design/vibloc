"""Export only the HEAD portion of a HEADZ character.
Slices the Body mesh at the neck (Z >= NECK_CUT) so we get a clean
floating head — no hands, no torso. All face features (eyes, brows,
teeth, ears, tongue, default hair) come along untouched."""
import bpy, sys, os, bmesh
from mathutils import Vector

argv = sys.argv
argv = argv[argv.index("--")+1:] if "--" in argv else []
out_path = argv[0] if argv else "/tmp/headz-work/out_head.glb"
# Optional 2nd arg: pose action name (e.g. "pose 10 (smiling)").
pose_name = argv[1] if len(argv) > 1 else None

# ── CHARACTER ISOLATION ──
# HEADZ .blend files are messy — each one carries the canonical
# character (the one rigged with its own armature) PLUS leftover
# meshes from other characters that the artist copy-pasted while
# building the file (e.g. the Female Brown/Black files contain
# stray Geo_Male_White_* meshes). Exporting all `Geo_*` meshes
# pulled those leftovers in, which then floated at the wrong
# position when rendered in Three.js.
#
# Discovery from audit pass:
#   • Female White.blend  → rig-female_white  (Female_White character)
#   • Female Brown.blend  → rig-female_black  (Brown is a Black DUP)
#   • Female Black.blend  → rig-female_black
#   • Male  White.blend   → rig-male_white
#   • Male  Brown.blend   → rig-male_black    (Brown is a Black DUP)
#   • Male  Black.blend   → rig-male_black
#
# So: detect the active character from the armature name and keep
# ONLY meshes whose name contains that character's prefix.
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
if arm is None:
    print("ERROR: no armature found, cannot determine character")
    sys.exit(1)
char_prefix = arm.name.replace('rig-', '').replace('rig_', '').lower()
# char_prefix examples: 'female_white' / 'male_black'
print(f"Character: {char_prefix} (from armature '{arm.name}')")

NECK_CUT_Z = 1.30  # everything below is removed (torso, arms, hands)

ctx = bpy.context
view_layer = ctx.view_layer
view_layer_obj_names = {o.name for o in view_layer.objects}

# ── Apply the requested pose action (face expression) ──
# Each HEADZ pose action lives in bpy.data.actions and stores the
# face/body shape at frame 72. Setting the armature's action to that
# pose and stepping the scene to frame 72 deforms the meshes via the
# Armature modifier; with `export_apply=True` + `export_skins=False`
# the glTF exporter bakes the deformed geometry into the output.
if pose_name:
    arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    if arm is None:
        print(f"WARN: no armature found, pose '{pose_name}' not applied")
    else:
        action = bpy.data.actions.get(pose_name)
        if action is None:
            # Try a case-insensitive contains match in case of typos
            for a in bpy.data.actions:
                if pose_name.lower() in a.name.lower():
                    action = a
                    break
        if action is None:
            print(f"WARN: action '{pose_name}' not found, pose unchanged")
        else:
            if not arm.animation_data:
                arm.animation_data_create()
            arm.animation_data.action = action
            # Pose actions hold their key at frame 72.
            target_frame = int(action.frame_range[0])
            ctx.scene.frame_set(target_frame)
            print(f"Applied pose: '{action.name}' at frame {target_frame}")

import re

KEEP_PREFIXES = ("Geo_",)
# Belongs-to-character predicate.
#
# HEADZ artists share generic utility meshes (Cartoony Eyes, Ears,
# Tongue, Teeth) across files using ANY character's prefix — even
# though they're meant to fit the canonical character of THIS file.
# Example: Female Black.blend has `Geo_Male_White_Cartoony Eyes.L`
# acting as the iris decal for Female Black. Excluding those by
# strict prefix would leave the character with no iris / no ears.
#
# Strategy:
#   • Character-specific meshes (Body, Eyebrow, Hair, Glasses, Hat,
#     Mask, Earrings, Necklace, Beard, Mustache) → must match the
#     canonical character prefix.
#   • Generic utility meshes (Cartoony Eyes, Ears, Tongue, Teeth)
#     → allowed regardless of prefix; we treat them as "any prefix
#     means it's the universal version for this file".
UTILITY_TOKENS = (
    'Cartoony Eyes',          # iris/pupil decal
    'Ears',
    'Tongue',
    'Cartoon Lower Teeth',
    'Cartoon Upper Teeth',
    'Lower Teeth',
    'Upper Teeth',
)
def belongs_to_char(name):
    after = name[len('Geo_'):] if name.startswith('Geo_') else name
    # Shared utility — keep regardless of which character prefix it
    # was authored under.
    if any(tok in after for tok in UTILITY_TOKENS):
        return True
    # Character-specific — strict prefix match.
    return after.lower().startswith(char_prefix + '_')
# A `.NNN` suffix is a HIGH-POLY subdivision dupe ONLY when the same
# base name (without the suffix) ALSO exists. E.g. `Body.002` is a
# dupe of `Body`, but `Hair.005` has no plain `Hair` sibling — it's a
# real variant. Build the base-name set so we filter the right thing.
all_geo_names = {
    o.name for o in bpy.data.objects
    if o.name in view_layer_obj_names
    and o.type == 'MESH'
    and o.name.startswith(KEEP_PREFIXES)
}
def base_of(name):
    return re.sub(r'\.\d{3,}$', '', name)
plain_bases = {n for n in all_geo_names if base_of(n) == n}
def is_high_poly_dupe(name):
    b = base_of(name)
    return b != name and b in plain_bases

# Skip-list: meshes that exist in the .blend but are too heavy for
# web (Hair011 = 84k verts, Space_helmet = 16k, Beard02 = 12k …).
# These are for high-end AR/print use; web doesn't need them.
HEAVY_VERT_LIMIT = 5000  # any mesh with more verts than this is dropped

# Deselect everything safely + UNHIDE all variants so they survive the
# selection filter below. Hair / Glasses / Hat / Mask / Earrings are
# hidden by default in the .blend so only one configuration shows in
# the editor — but we want ALL of them inside the GLB so the runtime
# can swap variants without re-exporting.
for obj in bpy.data.objects:
    if obj.name not in view_layer_obj_names: continue
    try:
        obj.select_set(False)
        if obj.type == 'MESH' and obj.name.startswith(KEEP_PREFIXES):
            obj.hide_viewport = False
            obj.hide_render = False
            obj.hide_set(False)
    except RuntimeError: pass

# Find the canonical character's Body mesh and slice it at the neck.
body_obj = None
for obj in bpy.data.objects:
    if obj.name not in view_layer_obj_names: continue
    if obj.type != 'MESH': continue
    n = obj.name
    if not n.startswith(KEEP_PREFIXES): continue
    if not belongs_to_char(n): continue   # skip leftover meshes
    if is_high_poly_dupe(n): continue
    if 'Body' in n:
        body_obj = obj
        break

if body_obj is None:
    print(f"ERROR: no Body mesh for character '{char_prefix}'")
    sys.exit(1)

print(f"Slicing {body_obj.name} at Z >= {NECK_CUT_Z}")

# Apply object world transform first so Z values match the bbox we measured
mesh = body_obj.data
matrix = body_obj.matrix_world.copy()

bm = bmesh.new()
bm.from_mesh(mesh)
bm.verts.ensure_lookup_table()
# Transform verts to world space for the cut
for v in bm.verts:
    v.co = matrix @ v.co

# Bisect at horizontal plane Z=NECK_CUT_Z, keeping the upper portion
geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
result = bmesh.ops.bisect_plane(
    bm, geom=geom,
    plane_co=Vector((0, 0, NECK_CUT_Z)),
    plane_no=Vector((0, 0, 1)),
    clear_inner=True,    # delete the lower half (body, arms, hands)
    clear_outer=False,
)
# NOTE: We intentionally do NOT cap the neck cross-section here.
# bmesh fill operations were producing faces with inconsistent
# normals → the whole head mesh appeared invisible because of
# back-face culling. The Three.js side handles "no cap" by simply
# never showing the head from below (camera maxPolarAngle ≈ 80°
# already prevents that).

# Convert back to local space
inv = matrix.inverted()
for v in bm.verts:
    v.co = inv @ v.co

bm.to_mesh(mesh)
bm.free()
mesh.update()

print(f"  → {len(mesh.vertices)} verts, {len(mesh.polygons)} polys remain")

# Select only the canonical character's meshes (filters out leftover
# Geo_<other-character>_* residue from other artists' workfiles).
selected_count = 0
skipped_alien = 0
for obj in bpy.data.objects:
    if obj.name not in view_layer_obj_names: continue
    if obj.type != 'MESH': continue
    n = obj.name
    if not n.startswith(KEEP_PREFIXES): continue
    if not belongs_to_char(n):
        skipped_alien += 1
        continue
    if is_high_poly_dupe(n): continue
    if len(obj.data.vertices) > HEAVY_VERT_LIMIT:
        print(f"  ~ skip heavy {n}  ({len(obj.data.vertices)}v > {HEAVY_VERT_LIMIT})")
        continue
    try:
        obj.select_set(True)
        selected_count += 1
        print(f"  + {n}  ({len(obj.data.vertices)}v)")
    except RuntimeError as e:
        print(f"  ! skip {n}: {e}")
print(f"  (skipped {skipped_alien} meshes from other characters)")

view_layer.objects.active = body_obj

print(f"\nExporting {selected_count} meshes → {out_path}")
os.makedirs(os.path.dirname(out_path), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_animations=False,
    export_skins=False,
    export_morph=False,
)
print(f"DONE  size={os.path.getsize(out_path)/1024:.1f} KB")
