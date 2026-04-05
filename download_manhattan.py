import urllib.request
import urllib.parse
import json
import time
import os
import math

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "public", "data")
OVERPASS_URL = "https://lz4.overpass-api.de/api/interpreter"

# Manhattan Midtown core (Times Sq ~ Rockefeller ~ Bryant Park block)
NAME = "manhattan"
SOUTH, WEST, NORTH, EAST = 40.753, -73.988, 40.760, -73.978
BBOX = f"{SOUTH},{WEST},{NORTH},{EAST}"

def query_overpass(query, label):
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    print(f"  Downloading {label}...")
    req = urllib.request.Request(OVERPASS_URL, data=data)
    req.add_header("User-Agent", "ViBloc-Downloader/1.0")
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    elements = len(result.get("elements", []))
    print(f"    Got {elements} elements")
    return result

def save_json(name, data):
    path = os.path.join(OUTPUT_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print(f"    Saved {path}")

if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. Buildings
    q_buildings = f"""[out:json][timeout:120];
(
  way["building"]({BBOX});
);
out body;
>;
out skel qt;
"""
    result = query_overpass(q_buildings, "buildings")
    save_json(f"{NAME}.json", result)
    time.sleep(3)

    # 2. Terrain (roads, parks, water, railways, etc.)
    q_terrain = f"""[out:json][timeout:120];
(
  way["highway"]({BBOX});
  way["leisure"="park"]({BBOX});
  way["leisure"="garden"]({BBOX});
  way["leisure"="playground"]({BBOX});
  way["leisure"="pitch"]({BBOX});
  way["landuse"]({BBOX});
  way["natural"="water"]({BBOX});
  way["water"]({BBOX});
  way["waterway"]({BBOX});
  way["railway"]({BBOX});
  way["amenity"="parking"]({BBOX});
  way["amenity"="school"]({BBOX});
  way["amenity"="university"]({BBOX});
  way["public_transport"="platform"]({BBOX});
  way["railway"="platform"]({BBOX});
);
out body;
>;
out skel qt;
"""
    result = query_overpass(q_terrain, "terrain")
    save_json(f"{NAME}_terrain.json", result)
    time.sleep(3)

    # 3. Districts / neighbourhoods
    q_districts = f"""[out:json][timeout:30];
(
  node["place"~"quarter|neighbourhood|suburb"]({BBOX});
);
out body;
"""
    result = query_overpass(q_districts, "districts")
    save_json(f"{NAME}_districts.json", result)
    time.sleep(3)

    # 4. Elevation grid (using Open-Elevation API alternative: generate flat for Manhattan)
    # Manhattan is relatively flat (~5-15m above sea level), so we create a flat elevation grid
    grid = 20
    elevations = []
    # Manhattan has very gentle terrain, mostly flat
    for row in range(grid):
        for col in range(grid):
            # Slight west-to-east slope (Hudson river side lower)
            lat = SOUTH + (NORTH - SOUTH) * row / (grid - 1)
            lon = WEST + (EAST - WEST) * col / (grid - 1)
            # Manhattan is roughly 5-15m, slightly higher toward east
            elev = 8.0 + (col / (grid - 1)) * 6.0
            elevations.append(round(elev, 1))

    elev_data = {
        "grid": grid,
        "south": SOUTH,
        "west": WEST,
        "north": NORTH,
        "east": EAST,
        "elevations": elevations,
        "minElevation": min(elevations),
        "maxElevation": max(elevations),
    }
    save_json(f"{NAME}_elevation.json", elev_data)

    print("\nDone! Manhattan data downloaded.")
