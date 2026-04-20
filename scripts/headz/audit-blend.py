"""Comprehensive HEADZ .blend audit — for each file:
  1. Armature(s)
  2. Mesh inventory grouped by character prefix + utility
  3. Pose actions
  4. Modifiers per mesh
  5. Visibility states
  6. Material list
  7. Collections / hierarchy
"""
import bpy, os, re

filepath = bpy.data.filepath
filename = os.path.basename(filepath)
print(f"\n{'='*70}")
print(f"FILE: {filename}")
print(f"PATH: {os.path.dirname(filepath)}")
print(f"{'='*70}")

view_layer_obj_names = {o.name for o in bpy.context.view_layer.objects}

# ── 1. ARMATURES ──
print("\n[1] ARMATURES")
for obj in bpy.data.objects:
    if obj.type != 'ARMATURE': continue
    arm = obj
    n_bones = len(arm.data.bones) if arm.data else 0
    in_view = arm.name in view_layer_obj_names
    ad = arm.animation_data
    cur_action = ad.action.name if ad and ad.action else "(none)"
    print(f"  - {arm.name}  bones={n_bones}  in_view={in_view}  current_action='{cur_action}'")

# ── 2. MESHES grouped by character prefix ──
print("\n[2] MESH INVENTORY (grouped by Geo_<character>_ prefix)")
groups = {}
for obj in bpy.data.objects:
    if obj.name not in view_layer_obj_names: continue
    if obj.type != 'MESH': continue
    n = obj.name
    if n.startswith('WGT-') or n.startswith('cs-') or n.startswith('Background'): continue
    if n.startswith('Light') or n.startswith('TEARS') or n.startswith('WGTS_'): continue
    if not n.startswith('Geo_'):
        groups.setdefault('(no Geo_ prefix)', []).append(obj)
        continue
    after = n[4:]  # strip "Geo_"
    # Match prefix like "Female_White_" / "male_black_"
    m = re.match(r'^([A-Za-z]+_[A-Za-z]+)_', after)
    if m:
        groups.setdefault(m.group(1), []).append(obj)
    else:
        groups.setdefault('(unrecognized)', []).append(obj)

for prefix, objs in sorted(groups.items()):
    total_v = sum(len(o.data.vertices) for o in objs)
    total_p = sum(len(o.data.polygons) for o in objs)
    print(f"\n  ├ {prefix:24s}  {len(objs):2d} meshes  {total_v:6d}v  {total_p:6d}p")
    for o in sorted(objs, key=lambda x: x.name):
        n = o.name
        after = n[4:].split('_', 2)[-1] if n.startswith('Geo_') else n  # part after prefix
        v = len(o.data.vertices)
        p = len(o.data.polygons)
        h = 'HIDE' if (o.hide_viewport or o.hide_get()) else 'show'
        # Modifiers
        mods = ', '.join(f"{m.type}" for m in o.modifiers) if o.modifiers else '-'
        print(f"  │   {h}  {after:38s}  {v:5d}v {p:5d}p  mods=[{mods}]")

# ── 3. POSE ACTIONS ──
print("\n[3] POSE ACTIONS (filtered to pose/expression names)")
pose_actions = [a for a in bpy.data.actions if 'pose' in a.name.lower()]
for a in sorted(pose_actions, key=lambda x: x.name):
    fr = a.frame_range
    print(f"  - '{a.name}'  frames={int(fr[0])}-{int(fr[1])}")

# ── 4. MATERIALS ──
print(f"\n[4] MATERIALS  ({len(bpy.data.materials)} total)")
for mat in sorted(bpy.data.materials, key=lambda x: x.name)[:40]:
    has_img = bool(mat.node_tree and any(n.type == 'TEX_IMAGE' for n in mat.node_tree.nodes)) if mat.use_nodes else False
    users = mat.users
    print(f"  - {mat.name:40s}  users={users}  has_texture={has_img}")
if len(bpy.data.materials) > 40:
    print(f"  ... +{len(bpy.data.materials)-40} more")

# ── 5. COLLECTIONS ──
print("\n[5] COLLECTIONS")
for col in bpy.data.collections:
    n_objs = len(col.objects)
    if n_objs == 0: continue
    print(f"  - {col.name}  ({n_objs} objects)")

# ── 6. SUMMARY ──
print("\n[6] SUMMARY")
total_meshes = sum(1 for o in bpy.data.objects if o.type == 'MESH' and o.name in view_layer_obj_names and o.name.startswith('Geo_'))
total_v = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == 'MESH' and o.name in view_layer_obj_names and o.name.startswith('Geo_'))
print(f"  Total Geo_ meshes in view layer: {total_meshes}")
print(f"  Total vertices:                  {total_v:,}")
print(f"  File size:                       {os.path.getsize(filepath)/1024/1024:.1f} MB")
