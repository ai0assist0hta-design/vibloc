#!/usr/bin/env python3
"""
resolve_addresses.py

Precompute verified, Google-searchable addresses for every building in each
area by reverse-geocoding the footprint centroid through Nominatim.

Output: public/data/{area}_addresses.json
    {"items": {"<osm_way_id>": {"address": "<full display_name>"}, ...}}

The script is RESUMABLE — it loads any existing cache and only queries new
building IDs. Nominatim rate limit is 1 req/sec; we sleep 1.1s between calls.

Priority order: buildings with name / tall / wikidata-matched first, so users
hitting Ctrl+C still get the most visible places covered.

Usage:
    python3 resolve_addresses.py                  # all areas
    python3 resolve_addresses.py manhattan        # one area
    python3 resolve_addresses.py --limit 200 la   # cap per-area requests
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional, List, Tuple, Dict

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "data")
USER_AGENT = "VIBLOC-AddressResolver/1.0 (contact@example.com)"
SLEEP_BETWEEN = 1.1   # Nominatim ToS = max 1 req/sec; stay under
MAX_RETRIES = 3
ACCEPT_LANG = "en,ja,ko"

AREAS = ["shinjuku", "shibuya", "itaewon", "gangnam", "manhattan", "la"]


# ---------- HTTP ----------

def nominatim_reverse(lat: float, lon: float) -> Optional[dict]:
    params = urllib.parse.urlencode({
        "format": "json",
        "lat": f"{lat:.6f}",
        "lon": f"{lon:.6f}",
        "zoom": "18",
        "addressdetails": "1",
        "accept-language": ACCEPT_LANG,
    })
    url = f"https://nominatim.openstreetmap.org/reverse?{params}"
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(5 + attempt * 3)
                continue
            if attempt == MAX_RETRIES - 1:
                return None
            time.sleep(2 * (attempt + 1))
        except Exception:
            if attempt == MAX_RETRIES - 1:
                return None
            time.sleep(2 * (attempt + 1))
    return None


# ---------- Centroid calc ----------

def ring_centroid(coords: List[Tuple[float, float]]) -> Tuple[float, float]:
    """Lat/lon centroid of a polygon by signed-area weighting."""
    if not coords:
        return 0.0, 0.0
    if coords[0] != coords[-1]:
        coords = coords + [coords[0]]
    a = cx = cy = 0.0
    for i in range(len(coords) - 1):
        x1, y1 = coords[i]
        x2, y2 = coords[i + 1]
        cross = x1 * y2 - x2 * y1
        a += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    a *= 0.5
    if abs(a) < 1e-12:
        # fallback: plain average
        xs = [c[0] for c in coords[:-1]]
        ys = [c[1] for c in coords[:-1]]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return cx / (6 * a), cy / (6 * a)


# ---------- Candidate selection ----------

def iter_buildings(area: str):
    path = os.path.join(DATA_DIR, f"{area}.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    nodes = {}
    for el in data["elements"]:
        if el["type"] == "node" and "lat" in el and "lon" in el:
            nodes[el["id"]] = (el["lon"], el["lat"])
    out = []
    for el in data["elements"]:
        if el["type"] != "way":
            continue
        tags = el.get("tags") or {}
        if "building" not in tags:
            continue
        coords = [nodes[n] for n in el.get("nodes", []) if n in nodes]
        if len(coords) < 3:
            continue
        lon, lat = ring_centroid(coords)
        if not (lat and lon):
            continue
        # Priority score: visible buildings first
        has_name = bool(tags.get("name") or tags.get("name:en") or tags.get("name:ja") or tags.get("name:ko"))
        height = 0.0
        try:
            height = float(tags.get("height", "0"))
        except Exception:
            pass
        levels = 0
        try:
            levels = int(tags.get("building:levels", "0"))
        except Exception:
            pass
        is_tall = height >= 30 or levels >= 8
        has_wiki = bool(tags.get("wikidata") or tags.get("wikipedia"))
        # Has full addr already?
        has_full_addr = (
            tags.get("addr:housenumber")
            and (
                tags.get("addr:street")
                or tags.get("addr:quarter")
                or tags.get("addr:subdistrict")
                or tags.get("addr:neighbourhood")
            )
        )
        # Score: smaller = higher priority
        score = 100
        if has_wiki: score -= 50
        if has_name: score -= 20
        if is_tall: score -= 15
        if not has_full_addr: score -= 10  # these NEED reverse geocode more
        out.append({
            "id": str(el["id"]),
            "lat": lat,
            "lon": lon,
            "score": score,
            "has_full_addr": has_full_addr,
            "has_name": has_name,
            "is_tall": is_tall,
            "has_wiki": has_wiki,
        })
    # Sort by score ascending (priority first)
    out.sort(key=lambda b: (b["score"], -1 if b["has_wiki"] else 0))
    return out


# ---------- Main per-area ----------

def format_display(data: dict) -> str:
    """Turn Nominatim JSON into a clean, Google-searchable single-line string."""
    if not data:
        return ""
    # display_name is the full canonical name — perfect for pasting into Google
    disp = data.get("display_name") or ""
    return disp


def process_area(area: str, limit: Optional[int] = None) -> None:
    out_path = os.path.join(DATA_DIR, f"{area}_addresses.json")
    cache: Dict[str, dict] = {}
    if os.path.exists(out_path):
        try:
            with open(out_path, "r", encoding="utf-8") as f:
                cache = json.load(f).get("items", {})
        except Exception:
            cache = {}
    print(f"\n=== {area} === (cache hits: {len(cache)})")

    candidates = iter_buildings(area)
    # Filter those we haven't resolved yet
    todo = [b for b in candidates if b["id"] not in cache]
    if limit is not None:
        todo = todo[:limit]
    total = len(todo)
    print(f"  candidates: {len(candidates)}, todo: {total}")

    start = time.time()
    for i, b in enumerate(todo):
        data = nominatim_reverse(b["lat"], b["lon"])
        disp = format_display(data) if data else ""
        if disp:
            cache[b["id"]] = {
                "address": disp,
                "lat": round(b["lat"], 6),
                "lon": round(b["lon"], 6),
            }
        # Save incrementally every 20 calls
        if (i + 1) % 20 == 0 or (i + 1) == total:
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump({"items": cache}, f, ensure_ascii=False, indent=2)
            elapsed = time.time() - start
            rate = (i + 1) / max(elapsed, 0.01)
            eta = (total - i - 1) / max(rate, 0.01)
            print(f"  [{area}] {i+1}/{total}  rate={rate:.2f}/s  eta={eta/60:.1f}min  cached={len(cache)}")
        time.sleep(SLEEP_BETWEEN)
    # Final save
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"items": cache}, f, ensure_ascii=False, indent=2)
    print(f"  [{area}] done. total cache size: {len(cache)}")


def main():
    args = sys.argv[1:]
    limit = None
    if "--limit" in args:
        i = args.index("--limit")
        limit = int(args[i + 1])
        args = args[:i] + args[i + 2 :]
    areas = [a for a in args if a in AREAS] or AREAS
    for a in areas:
        try:
            process_area(a, limit=limit)
        except KeyboardInterrupt:
            print("\nInterrupted — cache saved.")
            return


if __name__ == "__main__":
    main()
