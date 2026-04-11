import urllib.request
import urllib.parse
import json
import time
import os

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "public", "data")

AREAS = {
    "shinjuku": (35.685, 139.695, 35.695, 139.705),
    "shibuya":  (35.654, 139.696, 35.664, 139.706),
    "hongdae":  (37.549, 126.918, 37.560, 126.928),
    "gangnam":  (37.494, 127.024, 37.504, 127.034),
}

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

def build_query(south, west, north, east):
    bbox = f"{south},{west},{north},{east}"
    return f"""[out:json][timeout:30];
(
  way["highway"]({bbox});
  way["leisure"="park"]({bbox});
  way["landuse"="grass"]({bbox});
  way["natural"="water"]({bbox});
  way["waterway"]({bbox});
);
out body;
>;
out skel qt;
"""

def download_area(name, bbox):
    query = build_query(*bbox)
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    print(f"Downloading {name}...")
    req = urllib.request.Request(OVERPASS_URL, data=data)
    req.add_header("User-Agent", "ViBloc-TerrainDownloader/1.0")
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    out_path = os.path.join(OUTPUT_DIR, f"{name}_terrain.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f)
    elements = len(result.get("elements", []))
    print(f"  Saved {out_path} ({elements} elements)")
    return elements

if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for i, (name, bbox) in enumerate(AREAS.items()):
        if i > 0:
            print("  Waiting 2 seconds...")
            time.sleep(2)
        download_area(name, bbox)
    print("Done!")
