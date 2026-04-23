"""Normalize raw bake output → uniform 256×280 head-only PNG layers
ready for the web compositor.

For each character folder under <bake_root>/<base>/:
  1. Find the HEAD-ONLY bbox in base.png (top of alpha to first
     all-transparent gap below — handles male renders where feet are
     visible but body is invisible).
  2. Crop every layer (base + variants) to that bbox.
  3. Resize the crop into a uniform OUT_W×OUT_H canvas (Lanczos, head
     centered with transparent padding).
  4. DIFF every variant against the resized base — keep only pixels
     that differ by > THRESHOLD per channel. Result: variant-only
     alpha layer that stacks over base.png in the web app.
  5. Skip layers with < 12 differing pixels (empty / failed render).

Usage:
  python3 scripts/headz/normalize-layers.py <bake_root> <web_dest>

Example:
  python3 scripts/headz/normalize-layers.py \
    /tmp/headz-bake/ public/avatars/layers/

bake_root layout:  <bake_root>/{f-white,f-black,m-white,m-black}/*.png
web_dest layout:   <web_dest>/{f-white,f-black,...,f-brown,m-brown}/*.png
                   (Brown chars are copied from Black per .blend audit)
"""
import os, sys, shutil
from PIL import Image

OUT_W, OUT_H = 256, 280
THRESHOLD = 8
CHARS = ['f-white', 'f-black', 'm-white', 'm-black']

def widths(alpha, bbox):
    x0,y0,x1,y1 = bbox
    px = alpha.load()
    w = []
    for y in range(y0, y1):
        cnt = 0
        for x in range(x0, x1):
            if px[x,y] > 16: cnt += 1
        w.append(cnt)
    return w

def head_bbox(base):
    """First alpha-from-top region until first all-transparent row."""
    alpha = base.split()[-1]
    bbox = alpha.getbbox()
    if not bbox: return (0,0,base.width,base.height)
    x0,y0,x1,y1 = bbox
    ws = widths(alpha, bbox)
    head_end = None
    for i in range(8, len(ws)):
        if ws[i] == 0:
            head_end = i; break
    head_end_y = y0 + head_end if head_end else y1
    px = alpha.load()
    used = set()
    for y in range(y0, head_end_y):
        for x in range(x0, x1):
            if px[x,y] > 16: used.add(x)
    if used:
        fx0, fx1 = min(used), max(used)
    else:
        fx0, fx1 = x0, x1
    pad = 12
    return (max(0,fx0-pad), max(0,y0-4), min(base.width,fx1+pad), head_end_y)

def fit_into(img, w, h):
    iw, ih = img.size
    s = min(w/iw, h/ih)
    nw, nh = max(1,int(iw*s)), max(1,int(ih*s))
    resized = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (w,h), (0,0,0,0))
    canvas.paste(resized, ((w-nw)//2, (h-nh)//2), resized)
    return canvas

def normalize_one(src_dir, dst_dir):
    os.makedirs(dst_dir, exist_ok=True)
    base_path = os.path.join(src_dir, 'base.png')
    if not os.path.exists(base_path):
        print(f'  SKIP: no base.png in {src_dir}'); return
    base = Image.open(base_path).convert('RGBA')
    crop = head_bbox(base)
    print(f'  head_crop={crop} ({crop[2]-crop[0]}x{crop[3]-crop[1]})')
    base_norm = fit_into(base.crop(crop), OUT_W, OUT_H)
    base_norm.save(os.path.join(dst_dir, 'base.png'), optimize=True)
    bp = base_norm.load()

    for f in sorted(os.listdir(src_dir)):
        if not f.endswith('.png') or f == 'base.png': continue
        v = fit_into(Image.open(os.path.join(src_dir,f)).convert('RGBA').crop(crop),
                     OUT_W, OUT_H)
        vp = v.load()
        layer = Image.new('RGBA', (OUT_W, OUT_H), (0,0,0,0))
        lp = layer.load()
        kept = 0
        for y in range(OUT_H):
            for x in range(OUT_W):
                br,bg,bb,ba = bp[x,y]
                ir,ig,ib,ia = vp[x,y]
                if (abs(ir-br) > THRESHOLD or abs(ig-bg) > THRESHOLD or
                    abs(ib-bb) > THRESHOLD or abs(ia-ba) > THRESHOLD):
                    lp[x,y] = (ir,ig,ib,ia)
                    kept += 1
        if kept < 12: continue
        layer.save(os.path.join(dst_dir, f), optimize=True)

def main(bake_root, web_dest):
    for c in CHARS:
        src = os.path.join(bake_root, c)
        if not os.path.isdir(src):
            print(f'{c}: SKIP (no {src})'); continue
        dst = os.path.join(web_dest, c)
        if os.path.isdir(dst): shutil.rmtree(dst)
        print(f'{c}:')
        normalize_one(src, dst)
    # Brown bases re-use Black assets (HEADZ Brown.blend == Black.blend
    # per docs/headz-blend-analysis.md).
    for c, src_c in [('f-brown', 'f-black'), ('m-brown', 'm-black')]:
        src = os.path.join(web_dest, src_c)
        dst = os.path.join(web_dest, c)
        if os.path.isdir(src):
            if os.path.isdir(dst): shutil.rmtree(dst)
            shutil.copytree(src, dst)
            print(f'{c}: copied from {src_c}')

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: normalize-layers.py <bake_root> <web_dest>')
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
