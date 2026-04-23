#!/usr/bin/env bash
# Bake per-part PNG layers for ONE HEADZ source .blend.
# Used by the layered-PNG avatar customizer.
#
# Usage:
#   scripts/headz/bake-layers.sh <Source.blend> <out_dir> [pose]
#
# Example:
#   scripts/headz/bake-layers.sh \
#     "$HEADZ_SRC/Female - Source files/White.blend" \
#     /tmp/headz-bake/f-white \
#     "pose 7 (flat face)"
#
# Each variant runs in its own Blender process (fresh depsgraph).
# `render_layer.py` mutes ALL visibility drivers per Rigify-style
# rig conventions before rendering — required because HEADZ drives
# Geo_*.hide_render from armature UI bone props.

set -e
BLENDER='/Applications/Blender.app/Contents/MacOS/Blender'
SRC_BLEND="$1"
OUT_DIR="$2"
POSE="${3:-pose 7 (flat face)}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT_DIR"

# 1. List all Geo_ meshes in this .blend
LIST=$("$BLENDER" --background "$SRC_BLEND" --python-expr "
import bpy
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith('Geo_'):
        print('MESH::' + o.name)
" 2>/dev/null | grep "^MESH::" | sed 's|^MESH::||')

# 2. Detect canonical char prefix from the rig armature
CHAR_PREFIX=$("$BLENDER" --background "$SRC_BLEND" --python-expr "
import bpy
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
if arm: print('CHAR::' + arm.name.replace('rig-','').replace('rig_','').lower())
" 2>/dev/null | grep "^CHAR::" | sed 's|^CHAR::||' | head -1)
echo "Character: $CHAR_PREFIX"

# 3. Filter mesh list to canonical character + utility tokens
filter_mesh() {
  local n="$1"
  local after="${n#Geo_}"
  if [[ "$after" == *"Cartoony Eyes"* ]] || [[ "$after" == *"Ears"* ]] \
     || [[ "$after" == *"Tongue"* ]] || [[ "$after" == *"Cartoon Lower Teeth"* ]] \
     || [[ "$after" == *"Cartoon Upper Teeth"* ]] || [[ "$after" == *"Lower Teeth"* ]] \
     || [[ "$after" == *"Upper Teeth"* ]]; then
    echo yes; return
  fi
  local lc=$(echo "$after" | awk '{print tolower($0)}')
  if [[ "$lc" == "${CHAR_PREFIX}_"* ]]; then echo yes; return; fi
  echo no
}

VALID_MESHES=()
while IFS= read -r mesh; do
  if [[ "$(filter_mesh "$mesh")" == "yes" ]]; then
    VALID_MESHES+=("$mesh")
  fi
done <<< "$LIST"

find_mesh() {
  local pat="$1"
  for m in "${VALID_MESHES[@]}"; do
    if [[ "$m" =~ $pat ]]; then echo "$m"; return; fi
  done
}

# 4. Build the ALWAYS set (head meshes that anchor every variant)
ALWAYS=""
add_always() {
  local pat="$1"
  local m=$(find_mesh "$pat")
  if [[ -n "$m" ]]; then ALWAYS="${ALWAYS}${ALWAYS:+,}${m}"; fi
}
add_always '_Body$'
add_always '_Eyes$'
add_always '_Cartoony Eyes\.L$'
add_always '_Cartoony Eyes\.R$'
add_always '_Eyebrow$'
add_always '_Ears$'
echo "ALWAYS: $ALWAYS"

run() {
  local out_name="$1"; local variant="$2"
  echo "→ $out_name  [variant=${variant}]"
  "$BLENDER" --background "$SRC_BLEND" --python "$SCRIPT_DIR/render_layer.py" -- \
    "$OUT_DIR/$out_name" "$POSE" "$ALWAYS" "$variant" 2>&1 \
    | grep -E "Saved|Visible|Variant|Removed" | head -4
}

# 5. Render base + every variant (skip silently if mesh missing)
run "base.png" ""

for i in 1 2 3 4 5 6 7 8 9 10; do
  m=$(find_mesh "_Hair\.0*${i}$")
  if [[ -n "$m" ]]; then run "hair-${i}.png" "$m"; fi
done
for i in 1 2 3; do
  m=$(find_mesh "_Glasses\.0*${i}$")
  if [[ -n "$m" ]]; then run "glasses-${i}.png" "$m"; fi
done
m=$(find_mesh "_Hat$");      if [[ -n "$m" ]]; then run "hat.png" "$m"; fi
m=$(find_mesh "_Earrings$"); if [[ -n "$m" ]]; then run "earrings.png" "$m"; fi
for i in 1 2 3; do
  m=$(find_mesh "_Beard0*${i}$")
  if [[ -n "$m" ]]; then run "beard-${i}.png" "$m"; fi
done
for i in 1 2 3; do
  m=$(find_mesh "_Mustache\.0*${i}$")
  if [[ -n "$m" ]]; then run "mustache-${i}.png" "$m"; fi
done

echo "DONE → $OUT_DIR"
