"""Render ONE PNG layer of a HEADZ character — head + chosen variant.

Bakes per-part PNG layers used by the layered-PNG avatar customizer
(`src/features/avatar/LayeredAvatar.tsx`). One Blender process per
layer keeps the depsgraph clean across renders.

Args (after `--`):
  out_path        : output PNG path
  pose_name       : pose action name substring (or "" for rest)
  always_csv      : comma-separated mesh names ALWAYS visible
                    (head/body/eyes/brows/ears)
  variant_csv     : comma-separated mesh names to ADD on top
                    (the hair / glasses / hat being baked this pass)

Best-practice guards (from Blender 4.x batch-render conventions):
  • MUTE then DELETE visibility drivers — production HEADZ rigs put
    drivers on Geo_*.hide_render driven by armature UI bones, which
    silently re-clobber any Python-set hide_render value. Without this
    step, only the default-visible meshes ever render.
  • Keep non-target meshes in the scene with `visible_camera=False`
    (not deletion) so Geometry Nodes hair that reads the host head as
    a scalp surface still evaluates correctly.
  • Force a depsgraph rebuild via `frame_set(current)` after toggles
    so render.render() picks up the new state.
  • Cycles persistent_data + adaptive sampling for batch speed.

Refs:
  • docs.blender.org/api/current/bpy.types.Depsgraph.html
  • developer.blender.org/docs/release_notes/4.2/cycles/
  • Rigify driver-on-hide_render conventions: github.com/blender/blender-addons/tree/main/rigify
"""
import bpy, sys, os
from mathutils import Vector

argv = sys.argv
argv = argv[argv.index("--")+1:] if "--" in argv else []
out_path     = argv[0]
pose_name    = argv[1] if argv[1] else None
always_set   = set(n.strip() for n in argv[2].split(',') if n.strip())
variant_set  = set(n.strip() for n in argv[3].split(',') if n.strip()) if len(argv) > 3 else set()

os.makedirs(os.path.dirname(out_path), exist_ok=True)

# ── Pose ──
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
if pose_name and arm:
    action = next((a for a in bpy.data.actions
                   if pose_name.lower() in a.name.lower()), None)
    if action:
        if not arm.animation_data: arm.animation_data_create()
        arm.animation_data.action = action
        bpy.context.scene.frame_set(int(action.frame_range[0]))

# ── Render settings (Cycles, batch-tuned) ──
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
scene.cycles.use_denoising = True
try: scene.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.1
scene.render.use_persistent_data = True   # 3-10x speedup across batch
try: scene.cycles.device = 'GPU'
except Exception: pass
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.use_nodes = False
scene.render.use_compositing = False
scene.render.use_sequencer = False

# ── Front camera (50mm, head-centered) ──
HEAD_CENTER = Vector((0, 0, 1.46))
cam_data = bpy.data.cameras.new('FrontCam')
cam_data.lens = 50.0
cam_obj = bpy.data.objects.new('FrontCam', cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
cam_obj.location = HEAD_CENTER + Vector((0, -1.4, 0))
cam_obj.rotation_euler = (1.5707963, 0, 0)
scene.camera = cam_obj

# ── Kill ALL visibility-controlling drivers across every datablock.
# HEADZ rigs drive Geo_*.hide_render and Mask*.show_render from UI bone
# props. Unless we mute+remove these drivers FIRST, any Python-set
# value gets overwritten on the next depsgraph evaluation.
def kill_visibility_drivers_on(datablock):
    n = 0
    ad = getattr(datablock, 'animation_data', None)
    if not ad: return 0
    for d in list(ad.drivers or []):
        dp = d.data_path
        if (dp in ('hide_viewport', 'hide_render') or
            dp.endswith('.show_viewport') or dp.endswith('.show_render') or
            '.hide_render' in dp or '.hide_viewport' in dp):
            try: ad.drivers.remove(d)
            except Exception: d.mute = True
            n += 1
    return n

drv_killed = 0
# Iterate every iterable bpy.data collection — catches drivers on
# objects, materials, node_groups, meshes, scenes, collections, etc.
for prop in dir(bpy.data):
    coll = getattr(bpy.data, prop, None)
    if not hasattr(coll, '__iter__'): continue
    try:
        for db in coll:
            drv_killed += kill_visibility_drivers_on(db)
    except Exception:
        pass
print(f"Removed/muted {drv_killed} visibility drivers")

view_layer_obj_names = {o.name for o in bpy.context.view_layer.objects}
keep = always_set | variant_set
hidden = 0
shown = 0
for o in bpy.data.objects:
    if o.type != 'MESH' or o.name not in view_layer_obj_names:
        continue
    try:
        o.hide_viewport = False
        o.hide_render = False
        o.hide_set(False)
    except Exception:
        pass
    if o.name in keep:
        try:
            o.visible_camera = True
            o.visible_shadow = True
            o.visible_diffuse = True
            o.visible_glossy = True
        except AttributeError:
            pass
        shown += 1
    else:
        # Hide from camera but keep in scene → Geometry Nodes that
        # reference the head as scalp source still evaluate correctly.
        try:
            o.visible_camera = False
            o.visible_shadow = False
            o.visible_diffuse = False
            o.visible_glossy = False
            o.visible_transmission = False
            o.visible_volume_scatter = False
        except AttributeError:
            cv = getattr(o, 'cycles_visibility', None)
            if cv: cv.camera = False
        hidden += 1

print(f"Visible to camera: {shown}, hidden from camera: {hidden}")
print(f"Always: {sorted(always_set)}")
print(f"Variant: {sorted(variant_set)}")

# Force depsgraph rebuild — frame_set is the most reliable trigger
# in batch mode. view_layer.update() alone misses some toggles.
bpy.context.scene.frame_set(bpy.context.scene.frame_current)
bpy.context.view_layer.update()

bpy.ops.render.render()
img = bpy.data.images.get('Render Result')
img.save_render(filepath=out_path)
print(f"Saved {out_path}  {os.path.getsize(out_path)//1024}KB")
