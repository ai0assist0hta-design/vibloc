"""Enumerate HEADZ's built-in customization system in a .blend file.

HEADZ rigs expose a UI panel of toggles (hair / glasses / outfits /
accessories) that the artist drives via custom properties on the rig
armature + pose bones. Each toggle is wired to one or more
hide_render / show_render drivers on the affected meshes / modifiers.

This script reverse-engineers that system by:
  1. Listing custom props on every armature object + every pose bone
  2. For each driver in the file, recording its target (what it
     controls) AND its variable sources (what controls it)
  3. Cross-referencing 1+2 → "controller_prop → list of controlled
     things" map = exactly the artist's UI panel as data

Usage:
  /Applications/Blender.app/Contents/MacOS/Blender --background \\
      "<path>/Female - Source files/White.blend" \\
      --python scripts/headz/audit-toggles.py

Output: human-readable text dump to stdout.
"""
import bpy, sys
from collections import defaultdict

# ── 1. Custom props on armature + pose bones ──
print("\n=== UI custom properties (armature + pose bones) ===\n")
for arm in [o for o in bpy.data.objects if o.type == 'ARMATURE']:
    print(f"Armature: {arm.name}")
    keys = [k for k in arm.keys() if k != '_RNA_UI']
    if keys:
        print(f"  arm props ({len(keys)}):")
        for k in sorted(keys):
            v = arm[k]
            print(f"    {k!r} = {v}")
    bone_props = []
    for b in arm.pose.bones:
        bk = [k for k in b.keys() if k != '_RNA_UI']
        if bk:
            bone_props.append((b.name, bk))
    if bone_props:
        print(f"  pose bones with props ({len(bone_props)}):")
        for bone, props in bone_props:
            print(f"    [{bone}] {sorted(props)}")
    print()

# ── 2. Driver inventory: what controls what ──
print("\n=== Drivers (target → variable sources) ===\n")
controlled_by = defaultdict(list)   # source_path → [(controlled_db, target_path)]
target_count = 0
for prop in dir(bpy.data):
    coll = getattr(bpy.data, prop, None)
    if not hasattr(coll, '__iter__'): continue
    try:
        for db in coll:
            ad = getattr(db, 'animation_data', None)
            if not ad: continue
            for d in (ad.drivers or []):
                target_count += 1
                if d.mute: continue
                drv = d.driver
                for var in drv.variables:
                    for tgt in var.targets:
                        if tgt.id is None: continue
                        src = f"{tgt.id.name}.{tgt.data_path}" if tgt.data_path else tgt.id.name
                        controlled_by[src].append((db.name, d.data_path))
    except Exception:
        pass
print(f"Total drivers: {target_count}\n")

# ── 3. Group by source = the artist's toggle ──
print("\n=== Toggle map (source prop → things it hides/shows) ===\n")
keep_only_visibility = True   # filter to just hide/show drivers
for src, items in sorted(controlled_by.items()):
    if keep_only_visibility:
        items = [(name, dp) for name, dp in items
                 if 'hide' in dp or 'show' in dp or '.influence' in dp or '.mute' in dp]
        if not items: continue
    print(f"{src}")
    for name, dp in items:
        print(f"   → {name}.{dp}")

# ── 4. Mesh inventory (so you can correlate with toggles) ──
print("\n=== Geo_ meshes in this file ===\n")
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith('Geo_'):
        nv = len(o.data.vertices)
        mods = [f"{m.type}:{m.name}" for m in o.modifiers]
        print(f"  {o.name:50s}  ({nv}v)  mods={mods}")
