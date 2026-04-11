#!/usr/bin/env python3
"""Download building/landmark data from Wikidata SPARQL endpoint for city areas."""

import json
import math
import sys
import os
import time
import urllib.request
import urllib.parse
import urllib.error

AREAS = {
    "shinjuku": {"south": 35.680, "west": 139.688, "north": 35.700, "east": 139.712},
    "shibuya": {"south": 35.649, "west": 139.691, "north": 35.669, "east": 139.711},
    "itaewon": {"south": 37.526, "west": 126.985, "north": 37.546, "east": 127.005},
    "gangnam": {"south": 37.489, "west": 127.019, "north": 37.509, "east": 127.039},
    "manhattan": {"south": 40.748, "west": -73.993, "north": 40.768, "east": -73.973},
    "la": {"south": 34.040, "west": -118.260, "north": 34.060, "east": -118.240},
}

SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
USER_AGENT = "ViBloc-DataCollector/1.0 (building data download; contact: vibloc@example.com)"

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "data")


def build_main_query(bbox):
    """Build SPARQL query to get buildings/landmarks within bounding box.

    Uses the Wikidata geo service for efficient spatial filtering,
    and direct P31 matching (no expensive subclass traversal).
    """
    # Center point and radius to cover the bounding box
    center_lat = (bbox['south'] + bbox['north']) / 2
    center_lon = (bbox['west'] + bbox['east']) / 2
    # Approximate radius in km to cover the bbox (diagonal / 2, with margin)
    dlat = bbox['north'] - bbox['south']
    dlon = bbox['east'] - bbox['west']
    radius_km = math.sqrt((dlat * 111)**2 + (dlon * 111 * math.cos(math.radians(center_lat)))**2) / 2 + 0.5

    return f"""
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?coord ?height ?floors ?typeLabel ?website ?image WHERE {{
  # Use geo service for efficient spatial search
  SERVICE wikibase:around {{
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point({center_lon} {center_lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "{radius_km}" .
  }}

  # Filter to exact bounding box
  FILTER(
    geof:latitude(?coord) >= {bbox['south']} &&
    geof:latitude(?coord) <= {bbox['north']} &&
    geof:longitude(?coord) >= {bbox['west']} &&
    geof:longitude(?coord) <= {bbox['east']}
  )

  # Instance of building-related classes (direct, no subclass traversal)
  ?item wdt:P31 ?type .
  VALUES ?type {{
    wd:Q41176    wd:Q11303    wd:Q210272   wd:Q27686    wd:Q11315
    wd:Q33506    wd:Q16560    wd:Q44539    wd:Q55488    wd:Q12819
    wd:Q57660343 wd:Q35112127 wd:Q483110   wd:Q24354    wd:Q13417114
    wd:Q1303167  wd:Q1244442  wd:Q205495   wd:Q655686   wd:Q160742
    wd:Q56105    wd:Q928830   wd:Q3947     wd:Q5
    wd:Q811979   wd:Q4830453  wd:Q18674739 wd:Q1195942  wd:Q1021645
    wd:Q18142    wd:Q856584   wd:Q132539   wd:Q11707    wd:Q4022
    wd:Q1060829  wd:Q40357    wd:Q5773747  wd:Q1081138  wd:Q20034747
    wd:Q174782   wd:Q1497375  wd:Q1021290  wd:Q629206   wd:Q157570
    wd:Q149566   wd:Q15243209 wd:Q39804    wd:Q131734
    wd:Q2977     wd:Q3469910  wd:Q19844914 wd:Q43501    wd:Q35535
    wd:Q1006876  wd:Q2087181  wd:Q744913   wd:Q5398426
  }}

  # Optional properties
  OPTIONAL {{ ?item wdt:P2048 ?height . }}
  OPTIONAL {{ ?item wdt:P1101 ?floors . }}
  OPTIONAL {{ ?item wdt:P856 ?website . }}
  OPTIONAL {{ ?item wdt:P18 ?image . }}

  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en,ja,ko" . }}
}}
ORDER BY ?itemLabel
"""


def build_uses_query(item_ids):
    """Build SPARQL query to get uses (P366) for a list of items."""
    values = " ".join(f"wd:{qid}" for qid in item_ids)
    return f"""
SELECT ?item ?useLabel WHERE {{
  VALUES ?item {{ {values} }}
  ?item wdt:P366 ?use .
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en,ja,ko" . }}
}}
"""


def build_occupants_query(item_ids):
    """Build SPARQL query to get occupants (P466) and tenants (P464) for items."""
    values = " ".join(f"wd:{qid}" for qid in item_ids)
    return f"""
SELECT ?item ?occupantLabel WHERE {{
  VALUES ?item {{ {values} }}
  {{ ?item wdt:P466 ?occupant . }}
  UNION
  {{ ?item wdt:P464 ?occupant . }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en,ja,ko" . }}
}}
"""


def sparql_request(query, max_retries=3, timeout=120):
    """Execute a SPARQL query against Wikidata with retry logic."""
    params = urllib.parse.urlencode({"query": query, "format": "json"})
    url = f"{SPARQL_ENDPOINT}?{params}"

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/sparql-results+json",
    }

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data
        except urllib.error.HTTPError as e:
            print(f"  HTTP error {e.code} on attempt {attempt}/{max_retries}")
            if e.code == 429:
                wait = 30 * attempt
                print(f"  Rate limited, waiting {wait}s...")
                time.sleep(wait)
            elif e.code == 500 or e.code == 503:
                wait = 10 * attempt
                print(f"  Server error, waiting {wait}s...")
                time.sleep(wait)
            else:
                raise
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            print(f"  Network error on attempt {attempt}/{max_retries}: {e}")
            if attempt < max_retries:
                wait = 10 * attempt
                print(f"  Retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise

    return None


def parse_coord(coord_str):
    """Parse a WKT point string like 'Point(lon lat)' into (lat, lon)."""
    if not coord_str:
        return None, None
    # Format: Point(longitude latitude)
    coord_str = coord_str.replace("Point(", "").replace(")", "")
    parts = coord_str.split()
    if len(parts) == 2:
        lon, lat = float(parts[0]), float(parts[1])
        return lat, lon
    return None, None


def get_value(binding, key, default=None):
    """Safely get a value from a SPARQL result binding."""
    if key in binding:
        return binding[key].get("value", default)
    return default


def get_qid(uri):
    """Extract Q-id from a Wikidata URI."""
    if uri and "/" in uri:
        return uri.rsplit("/", 1)[-1]
    return None


def download_area(area_name, bbox):
    """Download all building data for a single area."""
    print(f"\n{'='*60}")
    print(f"Downloading data for: {area_name}")
    print(f"  Bounding box: {bbox}")
    print(f"{'='*60}")

    # Step 1: Main query
    print("  Running main buildings query...")
    query = build_main_query(bbox)
    result = sparql_request(query)

    if not result:
        print(f"  ERROR: Failed to get results for {area_name}")
        return None

    bindings = result.get("results", {}).get("bindings", [])
    print(f"  Got {len(bindings)} raw results")

    # Parse into items, dedup by Q-id
    items_map = {}
    for b in bindings:
        uri = get_value(b, "item")
        qid = get_qid(uri)
        if not qid:
            continue

        coord_wkt = get_value(b, "coord")
        lat, lon = parse_coord(coord_wkt)

        if qid not in items_map:
            height_val = get_value(b, "height")
            floors_val = get_value(b, "floors")

            items_map[qid] = {
                "id": qid,
                "name": get_value(b, "itemLabel", ""),
                "description": get_value(b, "itemDescription", ""),
                "lat": lat,
                "lon": lon,
                "height": float(height_val) if height_val else None,
                "floors": int(float(floors_val)) if floors_val else None,
                "uses": [],
                "occupants": [],
                "type": get_value(b, "typeLabel", ""),
                "website": get_value(b, "website"),
                "image": get_value(b, "image"),
            }
        else:
            # Merge type if different
            existing_type = items_map[qid]["type"]
            new_type = get_value(b, "typeLabel", "")
            if new_type and new_type != existing_type and new_type not in existing_type:
                items_map[qid]["type"] = f"{existing_type}, {new_type}" if existing_type else new_type

    item_ids = list(items_map.keys())
    print(f"  Found {len(item_ids)} unique items")

    if not item_ids:
        return {"items": []}

    # Step 2: Get uses (P366) - in batches
    time.sleep(2)
    print("  Fetching usage data (P366)...")
    batch_size = 50
    for i in range(0, len(item_ids), batch_size):
        batch = item_ids[i:i + batch_size]
        try:
            uses_result = sparql_request(build_uses_query(batch))
            if uses_result:
                for b in uses_result.get("results", {}).get("bindings", []):
                    qid = get_qid(get_value(b, "item"))
                    use_label = get_value(b, "useLabel", "")
                    if qid and qid in items_map and use_label:
                        if use_label not in items_map[qid]["uses"]:
                            items_map[qid]["uses"].append(use_label)
        except Exception as e:
            print(f"  Warning: Failed to fetch uses batch: {e}")
        if i + batch_size < len(item_ids):
            time.sleep(2)

    # Step 3: Get occupants (P466/P464) - in batches
    time.sleep(2)
    print("  Fetching occupant/tenant data (P466/P464)...")
    for i in range(0, len(item_ids), batch_size):
        batch = item_ids[i:i + batch_size]
        try:
            occ_result = sparql_request(build_occupants_query(batch))
            if occ_result:
                for b in occ_result.get("results", {}).get("bindings", []):
                    qid = get_qid(get_value(b, "item"))
                    occ_label = get_value(b, "occupantLabel", "")
                    if qid and qid in items_map and occ_label:
                        if occ_label not in items_map[qid]["occupants"]:
                            items_map[qid]["occupants"].append(occ_label)
        except Exception as e:
            print(f"  Warning: Failed to fetch occupants batch: {e}")
        if i + batch_size < len(item_ids):
            time.sleep(2)

    items_list = list(items_map.values())
    # Sort by name
    items_list.sort(key=lambda x: x.get("name", ""))

    print(f"  Final item count: {len(items_list)}")

    # Summary stats
    with_height = sum(1 for x in items_list if x["height"] is not None)
    with_floors = sum(1 for x in items_list if x["floors"] is not None)
    with_uses = sum(1 for x in items_list if x["uses"])
    with_occ = sum(1 for x in items_list if x["occupants"])
    print(f"  Stats: {with_height} with height, {with_floors} with floors, {with_uses} with uses, {with_occ} with occupants")

    return {"items": items_list}


def save_result(area_name, data):
    """Save result to JSON file."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filepath = os.path.join(OUTPUT_DIR, f"{area_name}_wikidata.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Saved to: {filepath}")
    return filepath


def main():
    if len(sys.argv) > 1:
        selected = sys.argv[1:]
        for name in selected:
            if name not in AREAS:
                print(f"Unknown area: {name}")
                print(f"Available: {', '.join(AREAS.keys())}")
                sys.exit(1)
        areas_to_download = {name: AREAS[name] for name in selected}
    else:
        areas_to_download = AREAS

    print(f"Will download data for {len(areas_to_download)} area(s): {', '.join(areas_to_download.keys())}")

    results = {}
    for area_name, bbox in areas_to_download.items():
        try:
            data = download_area(area_name, bbox)
            if data:
                save_result(area_name, data)
                results[area_name] = len(data["items"])
            else:
                results[area_name] = "FAILED"
        except Exception as e:
            print(f"  ERROR for {area_name}: {e}")
            results[area_name] = f"ERROR: {e}"

        # Be polite between areas
        if area_name != list(areas_to_download.keys())[-1]:
            print("\n  Waiting 5s before next area...")
            time.sleep(5)

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for area, count in results.items():
        print(f"  {area}: {count} items" if isinstance(count, int) else f"  {area}: {count}")


if __name__ == "__main__":
    main()
