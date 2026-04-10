"""
Download verified US address-point data for VIBLOC's Manhattan and Los
Angeles scenes from official city open-data portals and save as a small
static JSON we serve from our own origin.

Source attribution
------------------
Manhattan
  Upstream: NYC OpenData — Address Points (resource g6pj-hd8k)
  License:  Public Domain (NYC government open data)
  URL:      https://data.cityofnewyork.us/resource/g6pj-hd8k.json
  Auth:     None required for low-volume access (SoQL).

Los Angeles
  Upstream: LA GeoHub — Addresses (LA County / LA City open data)
  License:  Public Domain / open
  URL:      https://maps.lacity.org/lahub/rest/services/Address_Database/MapServer/0/query
  Auth:     None required.

Both endpoints are city-government-operated. We make a single bbox-bounded
request per city and store the result. Runtime makes ZERO third-party
requests; the JSON is served from our own origin.

Output: public/data/us_addresses.json
"""

import urllib.request
import urllib.parse
import json
import os
import datetime
import time

OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), "public", "data", "us_addresses.json"
)


def http_get(url: str) -> bytes:
    print(f"  GET {url[:120]}{'...' if len(url) > 120 else ''}")
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "ViBloc-Builder/1.0 (+us-addresses)")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.read()


# Manhattan bbox (matches download_all.py manhattan area, slightly padded).
MANHATTAN_BBOX = {
    "south": 40.748, "west": -73.993, "north": 40.768, "east": -73.973,
}

# LA bbox (matches download_all.py la area, slightly padded).
LA_BBOX = {
    "south": 34.040, "west": -118.260, "north": 34.060, "east": -118.240,
}


def fetch_manhattan() -> list:
    """NYC OpenData SoQL: filter by bbox using within_box(the_geom, ...)."""
    base = "https://data.cityofnewyork.us/resource/g6pj-hd8k.json"
    bbox = MANHATTAN_BBOX
    where = (
        f"within_box(the_geom, {bbox['north']}, {bbox['west']},"
        f" {bbox['south']}, {bbox['east']})"
    )
    qs = urllib.parse.urlencode({
        "$where": where,
        "$limit": "50000",
        "$select": "the_geom, h_no, full_stree, zipcode, borough",
    })
    url = f"{base}?{qs}"
    raw = http_get(url)
    rows = json.loads(raw.decode("utf-8"))
    print(f"    Manhattan: {len(rows)} address points")
    out = []
    seen = set()
    for r in rows:
        geom = r.get("the_geom") or {}
        coords = geom.get("coordinates") or []
        if len(coords) < 2:
            continue
        lon, lat = float(coords[0]), float(coords[1])
        h_no = (r.get("h_no") or "").strip()
        street = (r.get("full_stree") or "").strip()
        if not h_no or not street:
            continue
        zipcode = (r.get("zipcode") or "").strip()
        # Compose Google-style English-locale address.
        addr = f"{h_no} {street}".strip()
        if zipcode:
            addr = f"{addr}, New York, NY {zipcode}"
        else:
            addr = f"{addr}, New York, NY"
        key = (round(lat, 6), round(lon, 6), addr)
        if key in seen:
            continue
        seen.add(key)
        out.append({"address": addr, "lat": lat, "lng": lon})
    return out


def fetch_la() -> list:
    """LA City Address Database — ArcGIS REST FeatureServer query."""
    base = (
        "https://maps.lacity.org/lahub/rest/services/Address_Database/MapServer/0/query"
    )
    bbox = LA_BBOX
    envelope = f"{bbox['west']},{bbox['south']},{bbox['east']},{bbox['north']}"
    qs = urllib.parse.urlencode({
        "where": "1=1",
        "geometry": envelope,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "HOUSE_NUMBER,STREET_NAME,STREET_TYPE,UNIT_RANGE,ZIP_CODE",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
        "resultRecordCount": "10000",
    })
    url = f"{base}?{qs}"
    raw = http_get(url)
    data = json.loads(raw.decode("utf-8"))
    feats = data.get("features", []) or []
    print(f"    LA: {len(feats)} address points")
    out = []
    seen = set()
    for f in feats:
        geom = f.get("geometry") or {}
        lon = geom.get("x")
        lat = geom.get("y")
        if lat is None or lon is None:
            continue
        attrs = f.get("attributes") or {}
        hn = str(attrs.get("HOUSE_NUMBER") or "").strip()
        sn = str(attrs.get("STREET_NAME") or "").strip()
        st = str(attrs.get("STREET_TYPE") or "").strip()
        zc = str(attrs.get("ZIP_CODE") or "").strip()
        if not hn or not sn:
            continue
        # Title-case street/type the way Google displays them.
        sn_t = sn.title()
        st_t = st.title()
        street = f"{sn_t} {st_t}".strip()
        addr = f"{hn} {street}, Los Angeles, CA"
        if zc:
            addr = f"{addr} {zc}"
        key = (round(float(lat), 6), round(float(lon), 6), addr)
        if key in seen:
            continue
        seen.add(key)
        out.append({"address": addr, "lat": float(lat), "lng": float(lon)})
    return out


def main() -> None:
    cities: dict = {}
    try:
        cities["manhattan"] = fetch_manhattan()
    except Exception as e:
        print(f"  Manhattan fetch failed: {e}")
        cities["manhattan"] = []
    time.sleep(2)
    try:
        cities["la"] = fetch_la()
    except Exception as e:
        print(f"  LA fetch failed: {e}")
        cities["la"] = []

    out = {
        "_sources": {
            "manhattan": "NYC OpenData — Address Points (g6pj-hd8k); Public Domain",
            "la": "LA City — Address Database (lahub); Public Domain",
        },
        "_attribution": (
            "Manhattan address data: City of New York (NYC OpenData)."
            " Los Angeles address data: City of Los Angeles (LA GeoHub)."
        ),
        "_generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "cities": cities,
    }
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(
        f"\nSaved {OUTPUT_PATH} ({size_kb:.1f} KB)"
        f" — manhattan: {len(cities.get('manhattan', []))},"
        f" la: {len(cities.get('la', []))}"
    )


if __name__ == "__main__":
    main()
