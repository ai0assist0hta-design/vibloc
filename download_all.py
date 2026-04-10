import urllib.request
import urllib.parse
import json
import time
import os
import math

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "public", "data")
OVERPASS_URL = "https://lz4.overpass-api.de/api/interpreter"

# Expanded areas (~3x larger: ~0.03° ≈ 3km x 3km)
AREAS = {
    "shinjuku": {
        "south": 35.680, "west": 139.688, "north": 35.700, "east": 139.712,
        "refLat": 35.690, "refLon": 139.700,
    },
    "shibuya": {
        "south": 35.649, "west": 139.691, "north": 35.669, "east": 139.711,
        "refLat": 35.659, "refLon": 139.701,
    },
    "itaewon": {
        "south": 37.526, "west": 126.985, "north": 37.546, "east": 127.005,
        "refLat": 37.536, "refLon": 126.995,
    },
    "gangnam": {
        "south": 37.489, "west": 127.019, "north": 37.509, "east": 127.039,
        "refLat": 37.499, "refLon": 127.029,
    },
    "manhattan": {
        "south": 40.748, "west": -73.993, "north": 40.768, "east": -73.973,
        "refLat": 40.7565, "refLon": -73.983,
    },
    "la": {
        "south": 34.040, "west": -118.260, "north": 34.060, "east": -118.240,
        "refLat": 34.050, "refLon": -118.250,
    },
}


def query_overpass(query, label, retries=5):
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    for attempt in range(retries):
        print(f"  Downloading {label}... (attempt {attempt+1})")
        try:
            req = urllib.request.Request(OVERPASS_URL, data=data)
            req.add_header("User-Agent", "ViBloc-Downloader/1.0")
            with urllib.request.urlopen(req, timeout=180) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            elements = len(result.get("elements", []))
            print(f"    Got {elements} elements")
            return result
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                wait = 30 * (attempt + 1)
                print(f"    Rate limited. Waiting {wait}s...")
                time.sleep(wait)
            else:
                raise


def save_json(name, data):
    path = os.path.join(OUTPUT_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    size_kb = os.path.getsize(path) / 1024
    print(f"    Saved {path} ({size_kb:.0f} KB)")


def download_area(name, cfg):
    bbox = f"{cfg['south']},{cfg['west']},{cfg['north']},{cfg['east']}"
    print(f"\n{'='*50}")
    print(f"  {name.upper()} — bbox: {bbox}")
    print(f"{'='*50}")

    # 1. Buildings
    # Note on the trailing entrance fetch: `>;` recurses to member nodes via
    # `out skel qt;` which is small (no tags). We then explicitly fetch any
    # node tagged `entrance=*` inside the bbox with `out body;` so the loader
    # can preserve the doorway tag and use it as a preferred entry-point coord
    # for "navigate here" deeplinks. Adds <2 % to payload size.
    q_buildings = f"""[out:json][timeout:180];
(
  way["building"]({bbox});
);
out body;
>;
out skel qt;
node["entrance"]({bbox});
out body;
"""
    result = query_overpass(q_buildings, f"{name} buildings")
    save_json(f"{name}.json", result)
    time.sleep(5)

    # 2. Terrain
    q_terrain = f"""[out:json][timeout:180];
(
  way["highway"]({bbox});
  way["leisure"="park"]({bbox});
  way["leisure"="garden"]({bbox});
  way["leisure"="playground"]({bbox});
  way["leisure"="pitch"]({bbox});
  way["leisure"="sports_centre"]({bbox});
  way["landuse"]({bbox});
  way["natural"="water"]({bbox});
  way["water"]({bbox});
  way["waterway"]({bbox});
  way["railway"]({bbox});
  way["amenity"="parking"]({bbox});
  way["amenity"="school"]({bbox});
  way["amenity"="university"]({bbox});
  way["public_transport"="platform"]({bbox});
  way["railway"="platform"]({bbox});
);
out body;
>;
out skel qt;
"""
    result = query_overpass(q_terrain, f"{name} terrain")
    save_json(f"{name}_terrain.json", result)
    time.sleep(5)

    # 3. Districts
    q_districts = f"""[out:json][timeout:30];
(
  node["place"~"quarter|neighbourhood|suburb"]({bbox});
);
out body;
"""
    result = query_overpass(q_districts, f"{name} districts")
    save_json(f"{name}_districts.json", result)
    time.sleep(3)

    # 4. Elevation (flat approximation)
    grid = 20
    elevations = []
    for row in range(grid):
        for col in range(grid):
            lat = cfg["south"] + (cfg["north"] - cfg["south"]) * row / (grid - 1)
            lon = cfg["west"] + (cfg["east"] - cfg["west"]) * col / (grid - 1)
            if name == "la":
                elev = 80.0 + (row / (grid - 1)) * 15.0
            elif name == "manhattan":
                elev = 8.0 + (col / (grid - 1)) * 6.0
            elif name == "itaewon":
                # Itaewon has hills
                elev = 20.0 + math.sin(row / grid * math.pi) * 25.0 + math.sin(col / grid * math.pi) * 10.0
            elif name == "gangnam":
                elev = 12.0 + (row / (grid - 1)) * 8.0
            elif name == "shibuya":
                # Shibuya has valleys
                cx, cy = 0.5, 0.5
                dx = col / (grid - 1) - cx
                dy = row / (grid - 1) - cy
                elev = 30.0 + (dx * dx + dy * dy) * 40.0
            else:  # shinjuku
                elev = 30.0 + (row / (grid - 1)) * 15.0
            elevations.append(round(elev, 1))

    elev_data = {
        "grid": grid,
        "south": cfg["south"],
        "west": cfg["west"],
        "north": cfg["north"],
        "east": cfg["east"],
        "elevations": elevations,
        "minElevation": min(elevations),
        "maxElevation": max(elevations),
    }
    save_json(f"{name}_elevation.json", elev_data)


if __name__ == "__main__":
    import sys
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Allow downloading specific area: python download_all.py shinjuku
    targets = sys.argv[1:] if len(sys.argv) > 1 else list(AREAS.keys())

    for name in targets:
        if name not in AREAS:
            print(f"Unknown area: {name}")
            continue
        download_area(name, AREAS[name])

    print("\nDone! All areas downloaded.")
