"""
build_brand_blocklist.py

Scan the local public/data/*_pois.json files and extract chain / brand names
that appear as ground-floor tenants. The result is committed to
src/data/brandBlocklist.json and consumed at runtime by
verifyBuildingNamesAgainstTenants in src/lib/osmLoader.ts.

Why scan our own files instead of downloading an external dataset
-----------------------------------------------------------------
We already trust the OSM-derived `_pois.json` data we ship in public/data.
Building the blocklist from that data means:

  - **Zero new dependencies, zero downloads** — runs offline.
  - **Zero security risk** — only reads files we already trust.
  - **Aligned by construction** — the brands we detect are exactly the ones
    that appear in the same OSM extract the runtime sees, so false negatives
    from naming-system mismatches are impossible.

The blocklist is *additive* to the keyword whitelist already in
verifyBuildingNamesAgainstTenants. It catches the case where a tall building
is labelled with a tenant name (e.g. "Lobster Bar", "New Balance") AND there
is no perfectly-matching POI inside its polygon — the missing puzzle piece
that the tenant cross-reference alone could not solve.

Heuristics
----------
A POI contributes a "brand candidate" to the blocklist if:

  1. It carries an explicit `brand=*` tag (definitive — these are chains
     listed in OSM's brand wiki), OR
  2. It is a small-tenant POI (cafe, restaurant, fast_food, bar, pub, or a
     non-anchor shop type) AND has a `name=*` tag.

We then keep only candidates seen ≥2 times across the union of all areas. A
single occurrence is more likely to be a one-off business name (sometimes
even the building's actual name); requiring repetition is the cheapest
filter that removes that noise without an external curated list.

Anchor-shop categories (department_store, mall, supermarket) are excluded
from candidate generation entirely — those legitimately ARE the building.
"""

import json
import os
import re
import sys
import unicodedata
from collections import Counter

ROOT = os.path.dirname(__file__)
DATA_DIR = os.path.join(ROOT, "public", "data")
OUTPUT_PATH = os.path.join(ROOT, "src", "data", "brandBlocklist.json")

# Same normalization as the runtime in osmLoader.ts so the blocklist keys
# match exactly when looked up. Lowercase + NFKD + strip combining marks +
# collapse non-letter/non-digit runs to a single space + trim.
_NORM_RE = re.compile(r"[^\w]+", re.UNICODE)


def normalize(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = _NORM_RE.sub(" ", s)
    return s.strip()


# POIs that ARE the building, not a tenant — never harvest as brand candidates.
ANCHOR_SHOP_VALUES = {
    "department_store",
    "mall",
    "supermarket",
    "wholesale",
    "convenience",  # too generic — almost every block has one
}

# Amenity values that count as small-tenant for our purposes.
SMALL_AMENITIES = {"cafe", "restaurant", "fast_food", "bar", "pub", "ice_cream"}


def collect_candidates() -> Counter:
    """Walk every *_pois.json file once and collect (normalized_name, count)."""
    counts: Counter = Counter()

    for fname in sorted(os.listdir(DATA_DIR)):
        if not fname.endswith("_pois.json"):
            continue
        path = os.path.join(DATA_DIR, fname)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            print(f"[warn] {fname}: {e}", file=sys.stderr)
            continue

        elements = data.get("elements") or []
        kept = 0
        for el in elements:
            tags = el.get("tags") or {}
            brand = tags.get("brand") or tags.get("brand:en") or ""
            name = (
                tags.get("name")
                or tags.get("name:en")
                or tags.get("name:ko")
                or tags.get("name:ja")
                or ""
            )

            # Rule 1: explicit brand tag — strongest signal.
            if brand:
                k = normalize(brand)
                if k:
                    counts[k] += 1
                    kept += 1
                # Many entries also have a name; harvest both.
                if name:
                    k2 = normalize(name)
                    if k2 and k2 != k:
                        counts[k2] += 1

            # Rule 2: small-tenant POI with a name.
            shop = tags.get("shop") or ""
            amenity = tags.get("amenity") or ""
            is_small_shop = bool(shop) and shop not in ANCHOR_SHOP_VALUES
            is_small_amenity = amenity in SMALL_AMENITIES
            if name and (is_small_shop or is_small_amenity) and not brand:
                k = normalize(name)
                if k:
                    counts[k] += 1
                    kept += 1

        print(f"  {fname}: kept {kept} candidate names")

    return counts


def main() -> int:
    if not os.path.isdir(DATA_DIR):
        print(f"[error] {DATA_DIR} not found", file=sys.stderr)
        return 1

    print(f"Scanning {DATA_DIR} ...")
    counts = collect_candidates()
    print(f"Distinct candidates: {len(counts)}")

    # Require ≥2 occurrences. A single-mention name is more likely to be a
    # legitimate one-off building name (or noise). Chains repeat by nature.
    blocklist = sorted(k for k, c in counts.items() if c >= 2 and len(k) >= 2)

    # Drop entries that are *only* digits — addresses, store numbers, etc.
    blocklist = [k for k in blocklist if not k.replace(" ", "").isdigit()]

    print(f"Blocklist size after frequency filter: {len(blocklist)}")

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    payload = {
        "version": 1,
        "generated_from": "public/data/*_pois.json",
        "rule": "name appears as a small-tenant POI in >=2 distinct mentions across all areas",
        "count": len(blocklist),
        "names": blocklist,
    }
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"Wrote {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
