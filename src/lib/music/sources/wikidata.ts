/**
 * Wikidata SPARQL adapter — find films/MVs shot near a given coord.
 *
 * Why Wikidata?
 * -------------
 * The user asked for an open archive that maps real buildings to the
 * films and music videos that were filmed there, so each clicked
 * building can get a recommendation algorithm tailored to its on-screen
 * history. The two viable open sources are:
 *
 *   1. **Wikidata** — community-edited, MIT-spirit (CC0 data),
 *      SPARQL endpoint at `query.wikidata.org/sparql` that supports
 *      CORS, no API key, no signup. The property `P915 (filming
 *      location)` connects films / TV / music videos to real-world
 *      places, and the `wikibase:around` SPARQL service lets us
 *      query "what filming locations exist within R metres of this
 *      coordinate" in one round trip.
 *
 *   2. IMDb / TMDb — both have richer metadata but require API
 *      keys and (IMDb) paid licensing. Disqualified by the user's
 *      "0원 유지" rule.
 *
 * So this module is a thin SPARQL client over Wikidata that always
 * resolves (never throws), aggressively caches per-coordinate, and
 * returns a normalized list of `FilmingLocationHit`.
 *
 * Polite-use notes
 * ----------------
 * • Wikidata's WDQS asks for a User-Agent identifying the app, but
 *   browsers control the UA header — we cannot set it from JS.
 *   Instead we attach an `Api-User-Agent` request header (which is
 *   accepted) and we keep request volume low via the cache below.
 * • We send Accept: application/sparql-results+json so the response
 *   is small JSON instead of XML.
 * • Query has LIMIT 12 and a tight WHERE clause to stay well under
 *   the 60s WDQS timeout.
 *
 * Reference: https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service
 */

const ENDPOINT = 'https://query.wikidata.org/sparql';

export type FilmingLocationHit = {
  /** Wikidata Q-id of the place (the building/landmark itself). */
  placeId: string;
  /** Human-readable place label (e.g. "Empire State Building"). */
  placeLabel: string;
  /** Distance from query point in km (Wikidata returns this). */
  distanceKm: number | null;
  /** Wikidata Q-id of the film / MV. */
  filmId: string;
  /** Human-readable film/MV title (e.g. "King Kong"). */
  filmLabel: string;
  /** Year released, when available. */
  year: number | null;
  /** True if Wikidata classifies this as a music video (Q193977). */
  isMusicVideo: boolean;
};

// ─── Cache ──────────────────────────────────────────────────────────
// Cache by lat/lon rounded to 4 decimals (~10 m) so two clicks on the
// same building share one HTTP round trip. 6 hour TTL — Wikidata
// changes slowly enough that this is plenty conservative.
const TTL_MS = 6 * 60 * 60 * 1000;

function cacheKey(lat: number, lon: number, radiusKm: number): string {
  return `vibloc.wd.${lat.toFixed(4)}|${lon.toFixed(4)}|${radiusKm}`;
}

function cacheGet(key: string): FilmingLocationHit[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; v: FilmingLocationHit[] };
    if (Date.now() - parsed.t > TTL_MS) return null;
    return parsed.v;
  } catch {
    return null;
  }
}

function cacheSet(key: string, v: FilmingLocationHit[]): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* storage full — ignore */
  }
}

// ─── SPARQL response shape ──────────────────────────────────────────
// WDQS returns a fixed binding-array shape that we narrow inline.
type SparqlBinding = Record<
  string,
  { type: string; value: string; datatype?: string }
>;

type SparqlResponse = {
  results?: {
    bindings?: SparqlBinding[];
  };
};

function extractQId(uri: string): string {
  // "http://www.wikidata.org/entity/Q12345" → "Q12345"
  const m = uri.match(/Q\d+$/);
  return m ? m[0] : uri;
}

/**
 * Find films / music videos whose Wikidata `filming location (P915)`
 * points to any place within `radiusKm` km of (lat, lon). Returns a
 * deduped, year-desc-sorted list (newer first) capped at 12.
 *
 * Resolves to `[]` on any failure — never throws, never blocks UI.
 */
export async function findFilmingLocationsNear(
  lat: number,
  lon: number,
  radiusKm = 0.15,
  signal?: AbortSignal,
): Promise<FilmingLocationHit[]> {
  const key = cacheKey(lat, lon, radiusKm);
  const cached = cacheGet(key);
  if (cached) return cached;

  // SPARQL: find places near the coord, then any film/MV that lists
  // each place as a filming location. We check `instance of
  // music video (Q193977)` via a separate ASK-style optional so the
  // UI can label MVs differently from films.
  //
  // The `wikibase:around` service uses a WKT Point literal in
  // (LON LAT) order and a radius in KILOMETRES.
  const sparql = `
    SELECT DISTINCT ?place ?placeLabel ?dist ?film ?filmLabel ?year ?isMV WHERE {
      SERVICE wikibase:around {
        ?place wdt:P625 ?coord .
        bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${radiusKm}" .
        bd:serviceParam wikibase:distance ?dist .
      }
      ?film wdt:P915 ?place .
      OPTIONAL { ?film wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
      OPTIONAL {
        ?film wdt:P31/wdt:P279* wd:Q193977 .
        BIND(true AS ?isMV)
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ja,ko" }
    }
    ORDER BY DESC(?year)
    LIMIT 12
  `;

  const url = `${ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;

  try {
    const res = await fetch(url, {
      signal,
      credentials: 'omit',
      headers: {
        Accept: 'application/sparql-results+json',
        // 'User-Agent' is forbidden in browser fetch, but Wikidata
        // also accepts this custom header for app identification.
        'Api-User-Agent': 'vibloc/0.1 (open-source 3D city music app)',
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as SparqlResponse;
    const rows = data.results?.bindings ?? [];
    const hits: FilmingLocationHit[] = rows
      .map((b) => {
        if (!b.place?.value || !b.film?.value) return null;
        const yearStr = b.year?.value ?? '';
        const yearNum = yearStr ? parseInt(yearStr, 10) : NaN;
        const distStr = b.dist?.value ?? '';
        const distNum = distStr ? parseFloat(distStr) : NaN;
        return {
          placeId: extractQId(b.place.value),
          placeLabel: b.placeLabel?.value ?? '',
          distanceKm: Number.isFinite(distNum) ? distNum : null,
          filmId: extractQId(b.film.value),
          filmLabel: b.filmLabel?.value ?? '',
          year: Number.isFinite(yearNum) ? yearNum : null,
          isMusicVideo: !!b.isMV?.value,
        } as FilmingLocationHit;
      })
      .filter((h): h is FilmingLocationHit => h !== null && !!h.filmLabel);

    // Dedupe by filmId — same film often points at multiple nearby
    // places, we only want one entry per film.
    const seen = new Set<string>();
    const deduped: FilmingLocationHit[] = [];
    for (const h of hits) {
      if (seen.has(h.filmId)) continue;
      seen.add(h.filmId);
      deduped.push(h);
    }

    cacheSet(key, deduped);
    return deduped;
  } catch {
    return [];
  }
}

// ─── Songs / recordings linked to a nearby place ────────────────────
//
// Same `wikibase:around` pattern, but instead of P915 we query two
// other proven music-to-place properties Wikidata exposes:
//
//   • P826  (recording location)  — albums/songs with metadata
//                                    saying they were recorded at
//                                    this venue (Abbey Road, Capitol
//                                    Studios, etc.). This is the
//                                    musicology-grade hit.
//   • P921  (main subject)        — songs whose explicit subject
//                                    is this place (e.g. "Empire
//                                    State of Mind" main subject =
//                                    Empire State Building Q9188).
//
// Both properties are used by MusicBrainz contributors and the
// Wikidata WikiProject Music, so the underlying data is already
// vetted by an active community — exactly the "검증된 오픈 데이터
// 활용" the user asked for.

export type WikidataSongHit = {
  /** Wikidata Q-id of the song / album. */
  workId: string;
  /** Title of the song / album as labelled in en/ja/ko. */
  workLabel: string;
  /** Performer / artist label, when present. */
  performerLabel: string | null;
  /** Year of publication, when known. */
  year: number | null;
  /** Which Wikidata property linked it to the place. */
  via: 'recording-location' | 'main-subject';
  /** The matched place's label (for the badge text). */
  placeLabel: string;
};

function songCacheKey(lat: number, lon: number, radiusKm: number): string {
  return `vibloc.wd.song.${lat.toFixed(4)}|${lon.toFixed(4)}|${radiusKm}`;
}

function songCacheGet(k: string): WikidataSongHit[] | null {
  try {
    const raw = sessionStorage.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; v: WikidataSongHit[] };
    if (Date.now() - parsed.t > TTL_MS) return null;
    return parsed.v;
  } catch {
    return null;
  }
}

function songCacheSet(k: string, v: WikidataSongHit[]): void {
  try {
    sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), v }));
  } catch {
    /* ignore */
  }
}

/**
 * Find songs/albums Wikidata explicitly links to any place within
 * `radiusKm` km of (lat, lon) via either P826 (recording location)
 * or P921 (main subject restricted to musical works).
 *
 * Resolves to `[]` on any failure.
 */
export async function findSongsLinkedToPlaceNear(
  lat: number,
  lon: number,
  radiusKm = 0.15,
  signal?: AbortSignal,
): Promise<WikidataSongHit[]> {
  const key = songCacheKey(lat, lon, radiusKm);
  const cached = songCacheGet(key);
  if (cached) return cached;

  // Q2188189 = "musical work", which catches songs, singles, albums,
  // and tracks via subclass-of (P279). Restricting `?work` to that
  // subtree keeps P921 results from including non-music works whose
  // main subject happens to be the same place.
  const sparql = `
    SELECT DISTINCT ?work ?workLabel ?performerLabel ?year ?via ?placeLabel WHERE {
      SERVICE wikibase:around {
        ?place wdt:P625 ?coord .
        bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "${radiusKm}" .
      }
      {
        ?work wdt:P826 ?place .
        BIND("recording-location" AS ?via)
      } UNION {
        ?work wdt:P921 ?place .
        ?work wdt:P31/wdt:P279* wd:Q2188189 .
        BIND("main-subject" AS ?via)
      }
      OPTIONAL { ?work wdt:P175 ?performer }
      OPTIONAL { ?work wdt:P577 ?date . BIND(YEAR(?date) AS ?year) }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ja,ko" }
    }
    ORDER BY DESC(?year)
    LIMIT 15
  `;

  const url = `${ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
  try {
    const res = await fetch(url, {
      signal,
      credentials: 'omit',
      headers: {
        Accept: 'application/sparql-results+json',
        'Api-User-Agent': 'vibloc/0.1 (open-source 3D city music app)',
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as SparqlResponse;
    const rows = data.results?.bindings ?? [];
    const hits: WikidataSongHit[] = rows
      .map((b) => {
        if (!b.work?.value || !b.workLabel?.value) return null;
        const yearStr = b.year?.value ?? '';
        const yearNum = yearStr ? parseInt(yearStr, 10) : NaN;
        const viaStr = b.via?.value ?? '';
        const via: WikidataSongHit['via'] =
          viaStr === 'recording-location' ? 'recording-location' : 'main-subject';
        return {
          workId: extractQId(b.work.value),
          workLabel: b.workLabel.value,
          performerLabel: b.performerLabel?.value || null,
          year: Number.isFinite(yearNum) ? yearNum : null,
          via,
          placeLabel: b.placeLabel?.value ?? '',
        } as WikidataSongHit;
      })
      .filter((h): h is WikidataSongHit => h !== null);

    // Dedupe by workId.
    const seen = new Set<string>();
    const deduped: WikidataSongHit[] = [];
    for (const h of hits) {
      if (seen.has(h.workId)) continue;
      seen.add(h.workId);
      deduped.push(h);
    }
    songCacheSet(key, deduped);
    return deduped;
  } catch {
    return [];
  }
}
