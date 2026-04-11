"""
Download verified Japanese town/chome address data for VIBLOC's Tokyo cities
(Shinjuku-ku, Shibuya-ku) from a single trusted upstream and save it as a
small static JSON we serve from our own origin.

Source attribution
------------------
Upstream: https://japanese-addresses-v2.geoloniamaps.com (Geolonia, Inc.)
License:  MIT
Origin:   Derived from 国土交通省「位置参照情報」 (Ministry of Land,
          Infrastructure, Transport and Tourism — public-domain location
          reference dataset) and 国土地理院「電子国土基本図」.

Security model
--------------
- Build-time only. Runtime makes ZERO third-party requests.
- Single trusted source (Geolonia CDN, MIT-licensed, gov-derived).
- Output is a small JSON (< 200 KB) checked into the repo for review.
- Schema is flat and easy to audit.

Output: public/data/jp_addresses.json
Schema:
  {
    "_source": "...",
    "_license": "MIT (Geolonia) — gov data CC0",
    "_generatedAt": "<iso>",
    "cities": {
      "<city_en>": [
        { "town": "<漢字>", "town_en": "<roman>", "lat": <float>, "lng": <float> },
        ...
      ],
      ...
    }
  }
"""

import urllib.request
import urllib.parse
import json
import os
import datetime

OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), "public", "data", "jp_addresses.json"
)

UPSTREAM = "https://japanese-addresses-v2.geoloniamaps.com/api/ja"

# (prefecture_kanji, ward_kanji, vibloc_area_key) — only the wards VIBLOC renders.
TARGETS = [
    ("東京都", "新宿区", "shinjuku"),
    ("東京都", "渋谷区", "shibuya"),
]


def fetch_json(url: str) -> dict:
    print(f"  GET {url}")
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "ViBloc-Builder/1.0 (+jp-addresses)")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def best_town_label(entry: dict) -> tuple:
    """Pick the best Japanese / Roman town name from a Geolonia machi-aza entry."""
    ja = entry.get("oaza_cho") or entry.get("koaza") or ""
    en = entry.get("oaza_cho_r") or ""
    return ja, en


def main() -> None:
    cities: dict = {}
    for pref, ward, area_key in TARGETS:
        url = f"{UPSTREAM}/{urllib.parse.quote(pref)}/{urllib.parse.quote(ward)}.json"
        raw = fetch_json(url)
        entries = raw.get("data", [])
        towns = []
        seen = set()
        for e in entries:
            point = e.get("point")
            if not point or len(point) < 2:
                continue
            ja, en = best_town_label(e)
            if not ja:
                continue
            key = (ja, round(point[0], 5), round(point[1], 5))
            if key in seen:
                continue
            seen.add(key)
            towns.append({
                "town": ja,
                "town_en": en,
                "lng": float(point[0]),
                "lat": float(point[1]),
            })
        print(f"  {area_key}: {len(towns)} towns")
        cities[area_key] = towns

    out = {
        "_source": UPSTREAM,
        "_license": "MIT (Geolonia, Inc.); upstream gov data is CC0",
        "_attribution": (
            "Address data derived from 国土交通省「位置参照情報」 and 国土地理院."
            " Compiled by Geolonia, Inc. and redistributed under MIT."
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
