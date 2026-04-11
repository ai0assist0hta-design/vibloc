"""
Download verified address points for ALL VIBLOC cities from OpenStreetMap.

Source attribution
------------------
Upstream:  OpenStreetMap (Overpass API)
License:   Open Database License (ODbL)
Copyright: © OpenStreetMap contributors

Strategy
--------
For each city's bbox we fetch every NODE that has both `addr:housenumber`
and `addr:street`. These are "address points" — they are explicit
address markers contributed by the OSM community, generally derived from
local-government surveys and verified by mappers in the area. They are
INDEPENDENT of building polygons (which our city.json already contains),
so they give us a separate, trusted source of truth that we can use to
fuse / upgrade building addresses at load time.

Why these are "more verified"
- An `addr:housenumber` on a node is a deliberate community contribution.
- They are continuously updated by local mappers.
- They cover addresses our building polygons may have missed.
- Same license as the rest of our OSM data — no new trust boundary.

Security model
- Build-time only. Runtime makes ZERO third-party requests.
- Single trusted source (OSM Overpass) we already use.
- Output is a small JSON checked into the repo for review.

Output: public/data/addr_points.json
Schema:
  {
    "_source": "OSM Overpass — addr:housenumber + addr:street nodes",
    "_license": "ODbL — © OpenStreetMap contributors",
    "_generatedAt": "<iso>",
    "cities": {
      "<area_key>": [
        { "address": "<composed>", "lat": <float>, "lng": <float> },
        ...
      ]
    }
  }
"""

import urllib.request
import urllib.parse
import json
import os
import datetime
import time

OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), "public", "data", "addr_points.json"
)

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# bboxes mirror download_all.py
AREAS = {
    "shinjuku":  {"south": 35.680, "west": 139.690, "north": 35.700, "east": 139.710, "country": "JP"},
    "shibuya":   {"south": 35.649, "west": 139.691, "north": 35.669, "east": 139.711, "country": "JP"},
    "itaewon":   {"south": 37.526, "west": 126.985, "north": 37.546, "east": 127.005, "country": "KR"},
    "gangnam":   {"south": 37.489, "west": 127.019, "north": 37.509, "east": 127.039, "country": "KR"},
    "manhattan": {"south": 40.748, "west": -73.993, "north": 40.768, "east": -73.973, "country": "US-NY"},
    "la":        {"south": 34.040, "west": -118.260, "north": 34.060, "east": -118.240, "country": "US-CA"},
}


def fetch_overpass(query: str) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    last_err = None
    for url in OVERPASS_MIRRORS:
        print(f"  POST {url}")
        try:
            req = urllib.request.Request(url, data=data)
            req.add_header("User-Agent", "ViBloc-Builder/1.0 (+addr-points)")
            req.add_header("Accept", "application/json")
            with urllib.request.urlopen(req, timeout=240) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            print(f"    {type(e).__name__}: {e}")
            last_err = e
            time.sleep(3)
    raise RuntimeError(f"All overpass mirrors failed: {last_err}")


def compose_address(tags: dict, country: str) -> str:
    """Compose a Google-Maps-style English-locale address from addr:* tags."""
    hn = (tags.get("addr:housenumber") or "").strip()
    street = (tags.get("addr:street") or "").strip()
    city = (tags.get("addr:city") or "").strip()
    postcode = (tags.get("addr:postcode") or "").strip()
    state = (tags.get("addr:state") or tags.get("addr:province") or "").strip()
    if not hn or not street:
        return ""

    if country.startswith("US-"):
        st_abbr = "NY" if country == "US-NY" else "CA" if country == "US-CA" else state
        city_part = city or ("New York" if country == "US-NY" else "Los Angeles")
        addr = f"{hn} {street}, {city_part}, {st_abbr}"
        if postcode:
            addr = f"{addr} {postcode}"
        return addr

    if country == "JP":
        # Tokyo addresses are usually written as <ward>, <city>, <country>.
        # The OSM tags vary widely; we just emit a compact composition.
        ward = (tags.get("addr:ward") or "").strip()
        block = (tags.get("addr:block_number") or "").strip()
        parts = [p for p in [hn, block, street, ward, city, "Tokyo"] if p]
        return ", ".join(parts)

    if country == "KR":
        district = (tags.get("addr:district") or "").strip()
        parts = [p for p in [f"{hn} {street}".strip(), district, city or "Seoul"] if p]
        return ", ".join(parts)

    return f"{hn} {street}".strip()


def fetch_city(area_key: str, cfg: dict) -> list:
    bbox = f"{cfg['south']},{cfg['west']},{cfg['north']},{cfg['east']}"
    q = f"""[out:json][timeout:120];
(
  node["addr:housenumber"]["addr:street"]({bbox});
);
out body;
"""
    raw = fetch_overpass(q)
    elements = raw.get("elements", []) or []
    print(f"    {area_key}: {len(elements)} addr nodes")
    out = []
    seen = set()
    for e in elements:
        lat = e.get("lat")
        lon = e.get("lon")
        if lat is None or lon is None:
            continue
        tags = e.get("tags") or {}
        addr = compose_address(tags, cfg["country"])
        if not addr:
            continue
        key = (round(float(lat), 6), round(float(lon), 6), addr)
        if key in seen:
            continue
        seen.add(key)
        out.append({"address": addr, "lat": float(lat), "lng": float(lon)})
    return out


def main() -> None:
    cities: dict = {}
    for key, cfg in AREAS.items():
        try:
            cities[key] = fetch_city(key, cfg)
        except Exception as e:
            print(f"  {key} fetch failed: {e}")
            cities[key] = []
        time.sleep(3)  # be polite

    out = {
        "_source": "OpenStreetMap Overpass — addr:housenumber + addr:street nodes",
        "_license": "ODbL — © OpenStreetMap contributors",
        "_attribution": (
            "© OpenStreetMap contributors, available under the Open Database"
            " License (https://www.openstreetmap.org/copyright)."
        ),
        "_generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "cities": cities,
    }
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    counts = ", ".join(f"{k}:{len(v)}" for k, v in cities.items())
    print(f"\nSaved {OUTPUT_PATH} ({size_kb:.1f} KB) — {counts}")


if __name__ == "__main__":
    main()
