"""
Download verified Korean dong/neighbourhood data for VIBLOC's Seoul cities
(Itaewon = Yongsan-gu, Gangnam-gu) from OpenStreetMap and save it as a small
static JSON we serve from our own origin.

Source attribution
------------------
Upstream: OpenStreetMap (Overpass API)
License:  Open Database License (ODbL)
Copyright (c) OpenStreetMap contributors

This script fetches `place=*` nodes (quarter / neighbourhood / suburb /
hamlet / locality / town) inside the official OSM admin boundaries for
Yongsan-gu and Gangnam-gu. We use the gu boundary (not a hand-drawn bbox)
so the result includes every named dong/neighbourhood in the district.

Security model
--------------
- Build-time only. Runtime makes ZERO third-party requests.
- Single trusted source we already use elsewhere in this project (Overpass).
- Output is a small JSON checked into the repo for review.
- Schema mirrors `jp_addresses.json` for consistency.

Output: public/data/kr_addresses.json
"""

import urllib.request
import urllib.parse
import json
import os
import datetime
import time

OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), "public", "data", "kr_addresses.json"
)

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# (admin_name_en, vibloc_area_key)
TARGETS = [
    ("Yongsan-gu", "itaewon"),
    ("Gangnam-gu", "gangnam"),
]


def fetch_overpass(query: str) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    last_err = None
    for url in OVERPASS_MIRRORS:
        print(f"  POST {url}")
        try:
            req = urllib.request.Request(url, data=data)
            req.add_header("User-Agent", "ViBloc-Builder/1.0 (+kr-addresses)")
            req.add_header("Accept", "application/json")
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"    {type(e).__name__}: {e}")
            last_err = e
            time.sleep(3)
    raise RuntimeError(f"All overpass mirrors failed: {last_err}")


def fetch_district(name_en: str) -> list:
    # Resolve the gu admin area, then fetch all place nodes inside it.
    q = f"""[out:json][timeout:60];
area["boundary"="administrative"]["name:en"="{name_en}"]->.gu;
(
  node["place"~"^(quarter|neighbourhood|suburb|hamlet|locality|town)$"](area.gu);
);
out body;
"""
    raw = fetch_overpass(q)
    elements = raw.get("elements", [])
    print(f"    {name_en}: {len(elements)} place nodes")
    towns = []
    seen = set()
    for e in elements:
        lat = e.get("lat")
        lon = e.get("lon")
        if lat is None or lon is None:
            continue
        tags = e.get("tags") or {}
        ko = tags.get("name:ko") or tags.get("name") or ""
        en = tags.get("name:en") or ""
        if not ko and not en:
            continue
        key = (ko or en, round(lat, 5), round(lon, 5))
        if key in seen:
            continue
        seen.add(key)
        towns.append({
            "town": ko,
            "town_en": en,
            "lng": float(lon),
            "lat": float(lat),
        })
    return towns


def main() -> None:
    cities: dict = {}
    for name_en, area_key in TARGETS:
        cities[area_key] = fetch_district(name_en)
        time.sleep(2)  # be polite to overpass

    out = {
        "_source": "OpenStreetMap via Overpass API",
        "_license": "ODbL — © OpenStreetMap contributors",
        "_attribution": (
            "Address data © OpenStreetMap contributors, available under the"
            " Open Database License (https://www.openstreetmap.org/copyright)."
        ),
        "_generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "cities": cities,
    }
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f"\nSaved {OUTPUT_PATH} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
