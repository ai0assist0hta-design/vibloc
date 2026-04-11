#!/usr/bin/env python3
"""
Surgical patch: fetch OSM entrance=* nodes for each city's bbox and append
them to the existing buildings JSON files. Avoids re-downloading the full
~50MB-each building datasets.

Run: python3 patch_entrances.py [city1 city2 ...]
     (no args = all cities)
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "public", "data")
OVERPASS_URL = "https://z.overpass-api.de/api/interpreter"

AREAS = {
    "shinjuku":  (35.680, 139.688, 35.700, 139.712),
    "shibuya":   (35.649, 139.691, 35.669, 139.711),
    "itaewon":   (37.526, 126.985, 37.546, 127.005),
    "gangnam":   (37.489, 127.019, 37.509, 127.039),
    "manhattan": (40.748, -73.993, 40.768, -73.973),
    "la":        (34.040, -118.260, 34.060, -118.240),
}


def query_one(bbox):
    s, w, n, e = bbox
    q = f'[out:json][timeout:60];node["entrance"]({s},{w},{n},{e});out body;'
    data = urllib.parse.urlencode({"data": q}).encode("utf-8")
    req = urllib.request.Request(OVERPASS_URL, data=data)
    req.add_header("User-Agent", "ViBloc-EntrancePatch/1.0")
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def query(bbox, grid=4):
    """Tile the bbox into a grid×grid mesh to dodge Overpass 504s on dense areas."""
    s, w, n, e = bbox
    dLat = (n - s) / grid
    dLon = (e - w) / grid
    tiles = []
    for i in range(grid):
        for j in range(grid):
            tiles.append((s + i * dLat, w + j * dLon, s + (i + 1) * dLat, w + (j + 1) * dLon))
    elements = []
    seen = set()
    failed = 0
    for i, t in enumerate(tiles):
        ok = False
        for attempt in range(4):
            try:
                r = query_one(t)
                for el in r.get("elements", []):
                    if el.get("id") in seen:
                        continue
                    seen.add(el.get("id"))
                    elements.append(el)
                ok = True
                break
            except Exception as ex:
                wait = 8 * (attempt + 1)
                print(f"    tile {i+1}/{len(tiles)} retry in {wait}s ({ex})")
                time.sleep(wait)
        if not ok:
            failed += 1
        time.sleep(1)
    if failed:
        print(f"  WARN: {failed}/{len(tiles)} tiles ultimately failed")
    return {"elements": elements}


def patch(name):
    bbox = AREAS[name]
    path = os.path.join(OUTPUT_DIR, f"{name}.json")
    if not os.path.exists(path):
        print(f"  skip {name}: no {path}")
        return
    print(f"\n== {name} ==")
    print(f"  fetching entrance nodes for bbox {bbox} ...")
    result = query(bbox)
    new_entrances = result.get("elements", [])
    print(f"  got {len(new_entrances)} entrance nodes")

    with open(path, "r", encoding="utf-8") as f:
        existing = json.load(f)
    existing_ids = {
        el.get("id")
        for el in existing.get("elements", [])
        if el.get("type") == "node"
    }
    added = 0
    for el in new_entrances:
        if el.get("type") != "node":
            continue
        nid = el.get("id")
        if nid in existing_ids:
            # Node already in file (likely from way recurse, but tagless).
            # Update in-place: walk the existing list and add the entrance tag.
            for ex in existing["elements"]:
                if ex.get("id") == nid and ex.get("type") == "node":
                    tags = ex.get("tags") or {}
                    if not tags.get("entrance"):
                        tags["entrance"] = (el.get("tags") or {}).get("entrance", "yes")
                        ex["tags"] = tags
                        added += 1
                    break
        else:
            # Detached entrance node not part of any building way — append.
            existing["elements"].append(el)
            added += 1
    print(f"  patched {added} nodes (existing or appended)")

    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f)
    size_mb = os.path.getsize(path) / 1024 / 1024
    print(f"  saved {path} ({size_mb:.1f} MB)")


def main():
    cities = sys.argv[1:] or list(AREAS.keys())
    for i, name in enumerate(cities):
        if name not in AREAS:
            print(f"unknown city: {name}")
            continue
        try:
            patch(name)
        except Exception as e:
            print(f"  ERROR for {name}: {e}")
        if i < len(cities) - 1:
            time.sleep(5)  # be polite to Overpass


if __name__ == "__main__":
    main()
