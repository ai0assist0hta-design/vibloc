# VIBLOC — Security & Data Provenance

This document describes where VIBLOC's data comes from, how it is processed,
and the security boundaries we maintain. The goal is for any reviewer to be
able to audit the supply chain end-to-end.

## Threat model

1. **No runtime third-party calls.** A user typing in the search bar must
   not leak that query to any third party. All address / building / POI
   data is downloaded **once at build time** and served from our own origin.
2. **Audited dependencies only.** Every external data source is named, has
   a known license, and lives behind a single trust boundary (our own
   `public/data/*.json` files).
3. **No privileged client code.** The browser bundle has no API keys, no
   tokens, no user-identifying cookies.

## Data sources (build-time only)

| Dataset | Source | License | Used for |
|---|---|---|---|
| Buildings, terrain, POIs | OpenStreetMap via Overpass API | ODbL | 3D city geometry, address tags |
| Wikidata enrichment | Wikidata SPARQL | CC0 | Building names, descriptions |
| Wikipedia enrichment | Wikipedia REST | CC BY-SA 4.0 | Short descriptions |
| Japanese town/chome centroids (`jp_addresses.json`) | Geolonia japanese-addresses-v2 (derived from 国土交通省「位置参照情報」 + 国土地理院「電子国土基本図」) | MIT (Geolonia); upstream gov data is CC0 | Search fallback for Shinjuku / Shibuya |
| Korean dong / neighbourhood centroids (`kr_addresses.json`) | OpenStreetMap via Overpass API (filtered to Yongsan-gu / Gangnam-gu admin boundaries) | ODbL | Search fallback for Itaewon / Gangnam |
| Community-verified address points (`addr_points.json`) | OpenStreetMap via Overpass API (`addr:housenumber` + `addr:street` nodes for all 6 city bboxes) | ODbL | **Build-time fusion** — buildings within 25 m of an OSM-verified address point have their `address` field upgraded to that authoritative value (and `addressOriginal` set to `true`). |

All of the above are downloaded by Python scripts in the repo root
(`download_*.py`) and serialized to `public/data/*.json`. The runtime never
re-fetches them.

## Build-time download scripts

| Script | Output |
|---|---|
| `download_all.py` | Buildings, terrain, districts, elevation for all 6 cities |
| `download_pois.py` | POI nodes per city |
| `download_terrain.py` | Roads, parks, water |
| `download_wikidata.py` | Wikidata triples per building |
| `enrich_wikipedia.py` | Wikipedia descriptions |
| `download_jp_addresses.py` | Geolonia JP town/chome centroids |
| `download_kr_addresses.py` | OSM KR dong centroids inside the gu admin boundaries |
| `download_addr_points.py` | OSM `addr:*` nodes for all 6 city bboxes (community-verified address points used for build-time fusion) |
| `resolve_addresses.py` | Manual address overrides |

Each script:

- Uses a single, named upstream (no opportunistic mirrors that could
  swap content).
- Sets a clear `User-Agent` so upstream operators can identify us.
- Has retry / rate-limit handling.
- Is idempotent — re-running produces the same JSON modulo upstream
  edits.

## Runtime data flow

```
[browser]
   |
   |  fetch('/data/<city>.json')         <-- our own origin only
   |  fetch('/data/jp_addresses.json')   <-- our own origin only
   |  fetch('/data/kr_addresses.json')   <-- our own origin only
   v
[search bar]
   1. Local fuzzy match against loaded buildings.
   2. JP fallback: jpAddressResolver — uses /data/jp_addresses.json,
      maps query → town centroid → nearest building. ZERO network.
   3. KR fallback: krAddressResolver — uses /data/kr_addresses.json,
      maps query → dong centroid → nearest building. ZERO network.
   4. Last-ditch: external geocoder for camera pan only (no selection,
      no PII transmitted beyond the query the user typed). This step
      can be disabled in `SearchBar.tsx`.
```

The JP/KR resolvers are deliberately **strict**: they only return a
result when the query mentions a town/dong name they know about. This
keeps the search query inside the browser whenever a verified centroid
exists.

## Address provenance flag

Every `OSMBuilding` carries an `addressOriginal: boolean` field:

- `true` — the address was set from the building's own `addr:*` tags or
  from a manual override (`address_overrides.json`). This is the
  authoritative holder of that address.
- `false` — the address was borrowed from a nearby building during the
  post-pass (k-NN propagation) or fell back to the locality string.

The search scoring in `SearchBar.tsx` adds a +5000 bonus for
`addressOriginal === true` so that disambiguation always picks the
authoritative holder, not a neighbor that copied the same address.

## Dependency hygiene

- We run `npm audit` before each release. As of the current commit,
  Vite is on `8.0.7` (patched against the 3 high-severity CVEs in
  `8.0.1`) and `npm audit` reports 0 vulnerabilities.
- We do not install any package that introduces a runtime call to a
  third-party CDN. (For example, the Geolonia npm package was rejected
  because it would have proxied search queries to
  `japanese-addresses-v2.geoloniamaps.com` at runtime — we instead
  download the same data once at build time and self-host it.)

## What is NOT collected

- We do not store, log, or transmit search queries server-side.
- We do not set any analytics, tracking, or fingerprinting cookies.
- We do not embed third-party iframes or scripts in the production HTML.
