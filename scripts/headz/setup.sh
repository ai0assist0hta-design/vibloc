#!/usr/bin/env bash
# Regenerate HEADZ avatar GLBs from your local HEADZ source files.
# These files are intentionally NOT committed (license forbids redistribution
# — see docs/legal/headz-license.md).
#
# Usage:
#   AVATAR_FILE_DIR="/Users/you/Desktop/AVATAR FILE" ./scripts/headz/setup.sh
#
# Requirements:
#   - Blender 4.x or 5.x installed at /Applications/Blender.app (macOS)
#     or `blender` available in PATH (Linux/Windows)
#   - You purchased HEADZ from https://threedeeshop.gumroad.com/l/BbsEv
#   - The downloaded "AVATAR FILE" folder is unpacked locally

set -euo pipefail

# ── locate Blender ──
if [[ -x /Applications/Blender.app/Contents/MacOS/Blender ]]; then
  BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
elif command -v blender >/dev/null 2>&1; then
  BLENDER=$(command -v blender)
else
  echo "ERROR: Blender not found. Install from https://www.blender.org/" >&2
  exit 1
fi

# ── locate AVATAR FILE folder ──
SRC="${AVATAR_FILE_DIR:-$HOME/Desktop/AVATAR FILE}"
if [[ ! -d "$SRC/Source_Files" ]]; then
  echo "ERROR: HEADZ source files not found at: $SRC/Source_Files" >&2
  echo "Set AVATAR_FILE_DIR=/path/to/your/AVATAR\\ FILE and rerun." >&2
  exit 1
fi

# ── output directory (gitignored) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT="$REPO_ROOT/public/models/headz"
mkdir -p "$OUT"

PY="$SCRIPT_DIR/export-head.py"
# Default face pose for the avatar. Pose 7 (flat face) keeps eyes
# wide open — pose 10 (smiling) closes them into squint slits which
# hides the iris/sclera entirely. For 3D avatars seen from a distance
# we want eyes visible. Override via:
#   POSE="pose 10 (smiling)" ./scripts/headz/setup.sh
POSE="${POSE:-pose 7 (flat face)}"

echo "Blender: $BLENDER"
echo "Source : $SRC"
echo "Output : $OUT"
echo "Pose   : $POSE"
echo

run_export() {
  local blend_path="$1" out_name="$2"
  echo "→ exporting $out_name …"
  "$BLENDER" --background "$blend_path" --python "$PY" -- "$OUT/$out_name" "$POSE" \
    > /tmp/headz-export-$out_name.log 2>&1 || true
  if [[ -f "$OUT/$out_name" ]]; then
    local kb=$(du -k "$OUT/$out_name" | awk '{print $1}')
    echo "   ok  ${kb}KB"
  else
    echo "   FAILED — see /tmp/headz-export-$out_name.log" >&2
    return 1
  fi
}

# HEADZ ships only 2 unique characters per gender (White + Black).
# The "Brown" .blend files are duplicates of "Black" — verified via
# per-file mesh audit. We export the 4 distinct characters only.
#
# Female: folder is "Female - Source files"
for v in white black; do
  V=$(echo "$v" | sed 's/.*/\u&/')
  run_export "$SRC/Source_Files/Female - Source files/$V.blend" "f-$v.glb"
done

# Male: folder is just "Source files"  (HEADZ pack quirk)
for v in white black; do
  V=$(echo "$v" | sed 's/.*/\u&/')
  # m-black ships with NO Eyebrow mesh in source — borrow m-white's
  # via the donor 3rd arg so the rendered face has brows.
  if [[ "$v" == "black" ]]; then
    DONOR="$SRC/Source_Files/Source files/White.blend"
    "$BLENDER" --background "$SRC/Source_Files/Source files/$V.blend" \
      --python "$PY" -- "$OUT/m-$v.glb" "$POSE" "$DONOR" \
      > /tmp/headz-export-m-$v.log 2>&1 || true
    if [[ -f "$OUT/m-$v.glb" ]]; then
      kb=$(du -k "$OUT/m-$v.glb" | awk '{print $1}')
      echo "→ m-$v.glb (with Eyebrow donor) ok  ${kb}KB"
    else
      echo "   FAILED m-$v.glb — see /tmp/headz-export-m-$v.log" >&2
    fi
  else
    run_export "$SRC/Source_Files/Source files/$V.blend" "m-$v.glb"
  fi
done

echo
echo "All 4 GLBs ready in $OUT"
ls -la "$OUT"

# ── Per-part PNG layers (used by the layered avatar customizer) ──
# Bakes head + each variant separately, then normalizes to uniform
# 256×280 head-centered canvases with diff-extracted alpha layers.
LAYER_BAKE=/tmp/headz-bake
LAYER_OUT="$REPO_ROOT/public/avatars/layers"
LAYER_POSE="${LAYER_POSE:-pose 7 (flat face)}"
echo
echo "Baking per-part PNG layers (this takes ~20 min for 4 chars)…"
echo "  pose: $LAYER_POSE"
mkdir -p "$LAYER_BAKE"
for v in white black; do
  V=$(echo "$v" | sed 's/.*/\u&/')
  bash "$SCRIPT_DIR/bake-layers.sh" \
    "$SRC/Source_Files/Female - Source files/$V.blend" \
    "$LAYER_BAKE/f-$v" "$LAYER_POSE"
done
for v in white black; do
  V=$(echo "$v" | sed 's/.*/\u&/')
  bash "$SCRIPT_DIR/bake-layers.sh" \
    "$SRC/Source_Files/Source files/$V.blend" \
    "$LAYER_BAKE/m-$v" "$LAYER_POSE"
done
echo
echo "Normalizing layers → $LAYER_OUT …"
python3 "$SCRIPT_DIR/normalize-layers.py" "$LAYER_BAKE" "$LAYER_OUT"
echo "Done. Layers ready at $LAYER_OUT"

# ── Per-character PNG thumbnails ──
# Pulled from the official HEADZ render sets (Pose 10 smiling,
# frontal frames). Used by the lightweight 2D <HeadzThumb>
# wherever spinning up a Three.js Canvas would be wasteful.
THUMB_OUT="$REPO_ROOT/public/avatars/headz-thumbs"
mkdir -p "$THUMB_OUT"
echo
echo "Extracting 4 PNG thumbnails → $THUMB_OUT"
declare -a THUMB_JOBS=(
  "Female White|0020|f-white"
  "Female Black|0018|f-black"
  "Male White|0024|m-white"
  "Male Black|0024|m-black"
)
for j in "${THUMB_JOBS[@]}"; do
  IFS='|' read -r CHAR FRAME OUT <<< "$j"
  IN="$SRC/$CHAR/Pose 10 (smiling)/${FRAME}.png"
  if [[ ! -f "$IN" ]]; then
    echo "  WARN: missing $IN" >&2
    continue
  fi
  sips -Z 256 --setProperty format png "$IN" --out "$THUMB_OUT/${OUT}.png" \
    > /dev/null 2>&1
  echo "  ${OUT}.png  $(du -h "$THUMB_OUT/${OUT}.png" | awk '{print $1}')"
done
