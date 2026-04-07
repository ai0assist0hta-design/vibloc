import urllib.request
import urllib.parse
import json
import time
import os

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "public", "data")
OVERPASS_URL = "https://lz4.overpass-api.de/api/interpreter"

AREAS = {
    "shinjuku": {
        "south": 35.680, "west": 139.688, "north": 35.700, "east": 139.712,
    },
    "shibuya": {
        "south": 35.649, "west": 139.691, "north": 35.669, "east": 139.711,
    },
    "itaewon": {
        "south": 37.526, "west": 126.985, "north": 37.546, "east": 127.005,
    },
    "gangnam": {
        "south": 37.489, "west": 127.019, "north": 37.509, "east": 127.039,
    },
    "manhattan": {
        "south": 40.748, "west": -73.993, "north": 40.768, "east": -73.973,
    },
    "la": {
        "south": 34.040, "west": -118.260, "north": 34.060, "east": -118.240,
    },
}


def query_overpass(query, label, retries=5):
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    urls = [
        "https://lz4.overpass-api.de/api/interpreter",
        "https://overpass-api.de/api/interpreter",
        "https://z.overpass-api.de/api/interpreter",
    ]
    for attempt in range(retries):
        url = urls[attempt % len(urls)]
        print(f"  Downloading {label}... (attempt {attempt+1}, server: {url.split('//')[1].split('/')[0]})")
        try:
            req = urllib.request.Request(url, data=data)
            req.add_header("User-Agent", "ViBloc-Downloader/1.0")
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            elements = len(result.get("elements", []))
            print(f"    Got {elements} elements")
            return result
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            code = getattr(e, 'code', 0)
            if attempt < retries - 1:
                wait = 15 * (attempt + 1)
                print(f"    Error ({code or e.reason}). Waiting {wait}s...")
                time.sleep(wait)
            else:
                raise


def save_json(name, data):
    path = os.path.join(OUTPUT_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    size_kb = os.path.getsize(path) / 1024
    print(f"    Saved {path} ({size_kb:.0f} KB)")


def download_pois(name, cfg):
    bbox = f"{cfg['south']},{cfg['west']},{cfg['north']},{cfg['east']}"
    print(f"\n{'='*50}")
    print(f"  {name.upper()} POIs — bbox: {bbox}")
    print(f"{'='*50}")

    # Query all POI nodes inside the bounding box
    # This captures individual businesses, restaurants, shops, offices etc.
    # that are mapped as nodes inside buildings
    q_pois = f"""[out:json][timeout:180];
(
  node["amenity"]({bbox});
  node["shop"]({bbox});
  node["office"]({bbox});
  node["tourism"]({bbox});
  node["leisure"]({bbox});
  node["craft"]({bbox});
  node["healthcare"]({bbox});
  node["club"]({bbox});
);
out body;
"""
    result = query_overpass(q_pois, f"{name} POIs")
    save_json(f"{name}_pois.json", result)


if __name__ == "__main__":
    import sys
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    targets = sys.argv[1:] if len(sys.argv) > 1 else list(AREAS.keys())

    for name in targets:
        if name not in AREAS:
            print(f"Unknown area: {name}")
            continue
        download_pois(name, AREAS[name])
        time.sleep(5)

    print("\nDone! All POI data downloaded.")
