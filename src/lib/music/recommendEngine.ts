/**
 * Music recommendation engine — client-only, zero-cost edition.
 *
 * The engine has THREE algorithms and picks per-building based on
 * what data is available:
 *
 *   1. **filming-location** — if Wikidata reports any film/MV
 *      filmed within ~150 m of the building's coordinate, return
 *      that film's soundtrack tracks (via iTunes search). Most
 *      specific, highest signal — "this is the building from
 *      Lost in Translation, here's the OST".
 *
 *   2. **named-landmark** — if the building has a real proper
 *      name (Empire State Building, Tokyo Tower, etc.), search
 *      iTunes for tracks whose title literally contains that
 *      name. Songs *about* the place. Mid-specificity.
 *
 *   3. **city-vibe** — fall-through default. Apple RSS Top Songs
 *      for the country, filtered by the city's top GenreKey
 *      groups. Used for ordinary buildings with no on-screen or
 *      song-title history.
 *
 * Each algorithm shares the same `RecommendedTrack` output shape
 * so the UI never branches on source.
 *
 * Pipeline:
 *   ctx ──▶ try filming-location  ──▶ ≥3 tracks?  ──▶ return
 *       ──▶ try named-landmark    ──▶ ≥3 tracks?  ──▶ return
 *       ──▶ city-vibe (always succeeds via fallback)  ──▶ return
 *
 * The whole thing is one async function. Failures degrade
 * gracefully — Wikidata down → skip to landmark, iTunes down →
 * empty list with city vibe header.
 */

import { getCityVibe } from './cityProfile';
import { topSongsByCountry, searchTrack, type CountryCode } from './itunes';
import { normalizeGenre } from './normalizeGenre';
import {
  findFilmingLocationsNear,
  findSongsLinkedToPlaceNear,
} from './sources/wikidata';
import {
  titleSongForFilm,
  trackForMusicVideo,
  songsNamedAfterLandmark,
} from './filmMusic';
import { deriveBuildingVibe, type BuildingVibe } from './buildingVibe';
import type { RecommendedTrack, CityVibe } from './trackTypes';
import type { BuildingTag, CityAreaKey } from '../geo/osmLoader';
import type { GenreKey } from '../../types';
import { getCurrentWeatherSnapshot } from '../../stores/useWeatherStore';
import { getCurrentTimeSnapshot } from '../../stores/useTimeStore';
import type { WeatherSnapshot } from '../weather/openMeteo';

/** Which of the four algorithms produced the current recommendation. */
export type AlgorithmKind =
  | 'filming-location'
  | 'wikidata-song'
  | 'named-landmark'
  | 'city-vibe';

export type RecommendationResult = {
  vibe: CityVibe;
  tracks: RecommendedTrack[];
  algorithm: AlgorithmKind;
  /** The country chart's top picks at the time of resolution.
   *  pickWithOverlapLimit reserves one slot for one of these so every
   *  panel surfaces at least one current hit. Internal field — UI
   *  doesn't render this directly. */
  chartToppers?: RecommendedTrack[];
  /** Algorithm-specific context the UI can render as a badge. */
  context: {
    /** Set when algorithm === 'filming-location'. */
    filmTitle?: string;
    filmYear?: number | null;
    isMusicVideo?: boolean;
    /** Set when algorithm === 'wikidata-song'. The Wikidata place
     *  the song was linked to (e.g. "Empire State Building"). */
    linkedPlaceLabel?: string;
    /** "recording-location" or "main-subject" — which Wikidata
     *  property surfaced the song. */
    linkedVia?: 'recording-location' | 'main-subject';
    /** Set when algorithm === 'named-landmark'. */
    landmarkName?: string;
  };
};

/**
 * Heuristic — does this string look like a real proper name (and
 * not a generic OSM fallback like "Building" or just an address)?
 *
 * We require:
 *   • non-empty
 *   • not the literal "Building" placeholder
 *   • starts with an uppercase letter or CJK char
 *   • does NOT look like an address (no leading digits, no commas
 *     suggesting "123 Main St, City")
 */
function isProperLandmarkName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed || trimmed === 'Building') return false;
  if (/^\d/.test(trimmed)) return false; // address-like
  if (trimmed.includes(',')) return false; // address-like
  // Must start with an uppercase Latin letter or any CJK character.
  // Lowercase / leading symbol → probably not a proper name.
  return /^[A-Z\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(trimmed);
}

/**
 * Get a recommendation for the currently selected building by
 * **mixing** all 4 algorithms instead of cascading. The final list
 * is composed as:
 *
 *   • up to 2 tracks from the highest-priority **special** source
 *     (filming-location > wikidata-song > named-landmark), if any
 *   • the remaining slots filled with **local** city-vibe tracks
 *     (Apple RSS top songs in the building's country, biased to the
 *     city's top genres)
 *
 * This ensures every building gets primarily local music, with a
 * couple of contextual tracks sprinkled in when the location has
 * filmography / song-link history. Local picks are randomized within
 * a top-K candidate pool so two adjacent buildings in the same city
 * never see the exact same playlist.
 *
 * Always resolves — never throws.
 */
export async function recommendForBuilding(opts: {
  area: CityAreaKey;
  lat: number;
  lon: number;
  buildingName: string | null;
  /** Stable id used for the cross-building overlap guard. */
  buildingId: string;
  /** OSM-derived tenant tags from `OSMBuilding.tags`. When present
   *  they're translated into music keywords + genre boosts so the
   *  local pool reflects what kind of place the building actually is
   *  (Japanese restaurant → city pop, hotel → lounge, club → techno,
   *  museum → ambient, etc.). Empty / missing → pure city-vibe. */
  buildingTags?: BuildingTag[];
  limit?: number;
  signal?: AbortSignal;
}): Promise<RecommendationResult> {
  const { area, lat, lon, buildingName, buildingId, buildingTags, signal } = opts;
  const limit = opts.limit ?? 5;
  const vibe = getCityVibe(area);
  const buildingVibe = deriveBuildingVibe(buildingTags ?? []);

  // ─── Result cache (LRU + TTL) ─────────────────────────────────
  // Each building selection used to fan out into 4 external HTTP
  // round-trips (Wikidata, iTunes search, named-landmark, city-vibe
  // pool) every single time the panel reopened — even revisiting the
  // SAME building 5 seconds later re-ran the whole pipeline. Caching
  // by buildingId for 10 minutes makes the second visit instant and
  // the first visit unchanged. The session-scoped overlap guard
  // (`buildingTrackMemory`) still applies, so the cached pick never
  // collides with neighbours that were resolved meanwhile.
  const cacheKey = `${area}|${buildingId}|${limit}`;
  const cached = recommendationCache.get(cacheKey);
  if (cached && Date.now() - cached.at < RECOMMEND_TTL_MS) {
    return cached.value;
  }

  // Run all special-source algorithms in parallel — none of them
  // block the local picks, and we only consume up to 2 tracks from
  // whichever one wins, so we don't need a high threshold anymore.
  const [filming, wikiSong, landmark, local] = await Promise.all([
    tryFilmingLocation(lat, lon, vibe.country, limit, signal),
    tryWikidataSong(lat, lon, vibe.country, limit, signal),
    isProperLandmarkName(buildingName)
      ? tryNamedLandmark(buildingName as string, vibe.country, limit, signal)
      : Promise.resolve(null),
    // Pull a wider local pool than `limit` so the overlap guard has
    // room to skip already-used tracks without starving the result.
    // The building's tenant vibe is folded in here as keyword search
    // seeds + genre boosts on top of the city's base profile.
    cityVibeAlgorithm(area, limit * 4, signal, buildingVibe),
  ]);

  // Pick the highest-priority special source that returned anything.
  let specialKind: AlgorithmKind | null = null;
  let specialContext: RecommendationResult['context'] = {};
  let specialTracks: RecommendedTrack[] = [];
  if (filming) {
    specialKind = 'filming-location';
    specialContext = filming.context;
    specialTracks = filming.tracks;
  } else if (wikiSong) {
    specialKind = 'wikidata-song';
    specialContext = wikiSong.context;
    specialTracks = wikiSong.tracks;
  } else if (landmark) {
    specialKind = 'named-landmark';
    specialContext = landmark.context;
    specialTracks = landmark.tracks;
  }

  // Compose with the cross-building overlap guard so any two
  // buildings share at most 1 track session-wide.
  const specialQuota = specialKind ? Math.min(2, specialTracks.length) : 0;
  const pinned = specialTracks.slice(0, specialQuota);
  // Lift the chart-topper anchors out of the local pool — the picker
  // reserves one of the top-3 RSS chart positions so every panel
  // includes at least one current popular hit. `chartToppers` is the
  // top of the local pool BEFORE the shuffle randomization in
  // cityVibeAlgorithm; it survives because cityVibeAlgorithm exports
  // them on the result object below.
  const finalTracks = pickWithOverlapLimit(
    pinned,
    local.tracks,
    limit,
    buildingId,
    local.chartToppers,
  );

  const result: RecommendationResult = {
    vibe,
    tracks: finalTracks,
    algorithm: specialKind ?? 'city-vibe',
    context: specialContext,
  };
  // Insert at tail; evict oldest when over the soft cap. Tiny cap
  // because a single result is small and JS Maps maintain insertion
  // order, so first-key removal is O(1).
  recommendationCache.set(cacheKey, { value: result, at: Date.now() });
  if (recommendationCache.size > RECOMMEND_CACHE_MAX) {
    const oldest = recommendationCache.keys().next().value;
    if (oldest !== undefined) recommendationCache.delete(oldest);
  }
  return result;
}

// 10 min TTL — long enough to absorb back-and-forth navigation,
// short enough that a refresh button (RecommendedList exposes one)
// is still meaningful for grabbing fresh picks.
const RECOMMEND_TTL_MS = 10 * 60 * 1000;
const RECOMMEND_CACHE_MAX = 64;
const recommendationCache = new Map<string, { value: RecommendationResult; at: number }>();
/** Bust the cached recommendation for a building so the next fetch
 *  re-runs all four sources. Wired to the RecommendedList "refresh"
 *  button. */
export function invalidateRecommendation(area: CityAreaKey, buildingId: string, limit = 5): void {
  recommendationCache.delete(`${area}|${buildingId}|${limit}`);
}

/** Synchronous cache peek — lets the panel render the cached pick on
 *  the very first paint without going through the loading spinner.
 *  Returns null on a miss; expired entries are treated as a miss. */
export function peekRecommendation(
  area: CityAreaKey, buildingId: string, limit = 5,
): RecommendationResult | null {
  const hit = recommendationCache.get(`${area}|${buildingId}|${limit}`);
  if (!hit) return null;
  if (Date.now() - hit.at > RECOMMEND_TTL_MS) return null;
  return hit.value;
}

// ─── Cross-building overlap guard ──────────────────────────────────
// Session-scoped memory of which track ids each building was shown.
// We use it to enforce: any two buildings share at most 1 track. The
// special-source picks (film theme, etc.) are pinned and ALWAYS go in
// — only the local fill-tracks are constrained, since special tracks
// are inherently unique per building anyway.
//
// The map is bounded LRU so prolonged exploration sessions don't
// grow it unbounded.
const MAX_REMEMBERED_BUILDINGS = 30;
const buildingTrackMemory = new Map<string, Set<string>>();

// Session-wide set of every track id we've ever surfaced as a
// recommendation. Used as a soft prefer-unseen bias on refresh so
// hitting "새로고침" actually rotates the picks, not just reshuffles
// the same five RSS tracks.
const sessionShownTracks = new Set<string>();

function rememberBuilding(buildingId: string, trackIds: string[]): void {
  // Re-insert at the end so existing entries become "most recent".
  buildingTrackMemory.delete(buildingId);
  buildingTrackMemory.set(buildingId, new Set(trackIds));
  while (buildingTrackMemory.size > MAX_REMEMBERED_BUILDINGS) {
    const oldestKey = buildingTrackMemory.keys().next().value as
      | string
      | undefined;
    if (!oldestKey) break;
    buildingTrackMemory.delete(oldestKey);
  }
}

function pickWithOverlapLimit(
  pinned: RecommendedTrack[],
  candidates: RecommendedTrack[],
  limit: number,
  buildingId: string,
  chartToppers?: RecommendedTrack[],
): RecommendedTrack[] {
  const selected: RecommendedTrack[] = [];
  const selectedIds = new Set<string>();
  // Genre tally — caps each genre at 2 of the `limit` slots so the
  // panel doesn't end up "5 K-pop tracks" or "5 chart pop". Diversity
  // is the user-visible win we just got asked for.
  const genreCount = new Map<string, number>();
  const GENRE_CAP = Math.max(2, Math.ceil(limit / 2));

  const tryPush = (t: RecommendedTrack, ignoreGenreCap = false): boolean => {
    if (selected.length >= limit) return false;
    if (selectedIds.has(t.id)) return false;
    if (!ignoreGenreCap) {
      const g = String(t.genre || t.primaryGenreName || 'other');
      if ((genreCount.get(g) ?? 0) >= GENRE_CAP) return false;
    }
    selected.push(t);
    selectedIds.add(t.id);
    const g = String(t.genre || t.primaryGenreName || 'other');
    genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
    return true;
  };

  // Always include pinned (special-source) tracks first — these
  // ignore the genre cap because they're contextually pinned (film
  // theme / Wikidata song / landmark anthem).
  for (const t of pinned) {
    if (!tryPush(t, true)) continue;
  }

  // Reserve at least one slot for a current-chart guarantee. We pick
  // from the TOP 3 chart positions (latest popularity) and randomize
  // which one so two adjacent buildings don't both anchor on #1.
  // Genre cap also bypassed because "the #1 song" is a contextual pin.
  if (chartToppers && chartToppers.length > 0) {
    const pool = chartToppers.slice(0, 3);
    const order = [...pool].sort(() => Math.random() - 0.5);
    for (const t of order) {
      if (selected.length >= limit) break;
      if (tryPush(t, true)) break; // one guaranteed chart-topper is enough
    }
  }

  // Would adding `id` push any *other* building's overlap with us
  // to >1 (i.e. ≥2 shared tracks)?
  const wouldExceedOverlap = (id: string): boolean => {
    for (const [otherId, otherSet] of buildingTrackMemory) {
      if (otherId === buildingId) continue;
      if (!otherSet.has(id)) continue;
      // Count how many already-selected tracks the other building
      // also has — adding this one would push it from N to N+1.
      let alreadyShared = 0;
      for (const sid of selectedIds) {
        if (otherSet.has(sid)) alreadyShared++;
        if (alreadyShared >= 1) break; // ≥1 + this new one = ≥2 → block
      }
      if (alreadyShared >= 1) return true;
    }
    return false;
  };

  // First pass — strict: respects the cross-building overlap guard,
  // the genre cap, and prefers tracks the user has NOT already seen
  // this session (so refresh actually rotates the picks).
  const seenThisSession = (id: string) => sessionShownTracks.has(id);
  const sortedCandidates = [...candidates].sort((a, b) => {
    const sa = seenThisSession(a.id) ? 1 : 0;
    const sb = seenThisSession(b.id) ? 1 : 0;
    return sa - sb; // unseen first
  });
  for (const t of sortedCandidates) {
    if (selected.length >= limit) break;
    if (wouldExceedOverlap(t.id)) continue;
    if (!tryPush(t)) continue;
  }

  // Second pass — relax the genre cap if we're still short.
  for (const t of sortedCandidates) {
    if (selected.length >= limit) break;
    if (wouldExceedOverlap(t.id)) continue;
    if (!tryPush(t, true)) continue;
  }

  // Third pass (very rare): the constraint starved us — fill the
  // remaining slots without any guards so the panel never ships a
  // half-empty list.
  for (const t of sortedCandidates) {
    if (selected.length >= limit) break;
    if (selectedIds.has(t.id)) continue;
    selected.push(t);
    selectedIds.add(t.id);
  }

  rememberBuilding(buildingId, [...selectedIds]);
  for (const id of selectedIds) sessionShownTracks.add(id);
  return selected;
}

// ─── Special-source helpers ─────────────────────────────────────────
// Each one resolves to `null` on no-data so the mixer can fall
// through cleanly without try/catch noise at the call site.

type SpecialResult = {
  tracks: RecommendedTrack[];
  context: RecommendationResult['context'];
};

async function tryFilmingLocation(
  lat: number,
  lon: number,
  country: CountryCode,
  _limit: number,
  signal?: AbortSignal,
): Promise<SpecialResult | null> {
  try {
    const films = await findFilmingLocationsNear(lat, lon, 0.15, signal);
    for (const film of films) {
      // Title-song only — for film/MV-tagged buildings we surface
      // exactly ONE track (the main theme / MV's own song) and let
      // the rest of the playlist stay local-music.
      const tracks = film.isMusicVideo
        ? await trackForMusicVideo(film.filmLabel, country, 1, signal)
        : await titleSongForFilm(film.filmLabel, country, signal);
      if (tracks.length > 0) {
        return {
          tracks,
          context: {
            filmTitle: film.filmLabel,
            filmYear: film.year,
            isMusicVideo: film.isMusicVideo,
          },
        };
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function tryWikidataSong(
  lat: number,
  lon: number,
  country: CountryCode,
  limit: number,
  signal?: AbortSignal,
): Promise<SpecialResult | null> {
  try {
    const linked = await findSongsLinkedToPlaceNear(lat, lon, 0.15, signal);
    if (linked.length === 0) return null;
    const seen = new Set<string>();
    const tracks: RecommendedTrack[] = [];
    for (const w of linked) {
      const q = w.performerLabel
        ? `${w.workLabel} ${w.performerLabel}`
        : w.workLabel;
      const hits = await searchTrack(q, country, 5, signal);
      for (const t of hits) {
        if (!t.previewUrl) continue;
        if (seen.has(t.id)) continue;
        if (
          !t.trackName.toLowerCase().includes(w.workLabel.toLowerCase()) &&
          !w.workLabel.toLowerCase().includes(t.trackName.toLowerCase())
        ) {
          continue;
        }
        seen.add(t.id);
        tracks.push(t);
        break;
      }
      if (tracks.length >= limit) break;
    }
    if (tracks.length === 0) return null;
    return {
      tracks,
      context: {
        linkedPlaceLabel: linked[0].placeLabel,
        linkedVia: linked[0].via,
      },
    };
  } catch {
    return null;
  }
}

async function tryNamedLandmark(
  name: string,
  country: CountryCode,
  limit: number,
  signal?: AbortSignal,
): Promise<SpecialResult | null> {
  try {
    const tracks = await songsNamedAfterLandmark(name, country, limit, signal);
    if (tracks.length === 0) return null;
    return { tracks, context: { landmarkName: name } };
  } catch {
    return null;
  }
}

async function cityVibeAlgorithm(
  area: CityAreaKey,
  limit: number,
  signal?: AbortSignal,
  buildingVibe?: BuildingVibe,
): Promise<RecommendationResult> {
  const vibe = getCityVibe(area);

  // Genre weights = city base + building tenant boosts + silent
  // weather-mood bias. The building boosts are added on TOP of the
  // city weights (not replacing them) so a Japanese restaurant in
  // Manhattan still leans Manhattan jazz — it just lifts pop/jazz
  // higher inside that city's profile. The weather bias is even
  // smaller so it nudges ranking without ever overriding the city
  // identity, and is not surfaced anywhere in the UI.
  const cityGenreWeights = new Map<GenreKey, number>();
  vibe.topGenres.forEach((g, i) =>
    cityGenreWeights.set(g, vibe.topGenres.length - i),
  );
  if (buildingVibe) {
    for (const [g, n] of buildingVibe.genreBoosts) {
      cityGenreWeights.set(g, (cityGenreWeights.get(g) ?? 0) + n);
    }
  }
  applyWeatherBias(cityGenreWeights);
  applyTimeOfDayBias(cityGenreWeights);
  applySeasonBias(cityGenreWeights);

  // ── Stage 1 — RSS top songs in this country (chart signal) ──
  // Bumped 25 → 50 for a wider diversity pool — the panel returns
  // limit (5) tracks but we want a 10× pool to draw from so refresh
  // genuinely produces a different mix rather than reshuffling the
  // same handful.
  const topSongs = await topSongsByCountry(vibe.country, 50, signal);

  type Scored = { rss: (typeof topSongs)[number]; score: number };
  const scored: Scored[] = topSongs.map((song, idx) => {
    const g = normalizeGenre(song.primaryGenreName);
    const cityScore = cityGenreWeights.get(g) ?? 0;
    // Position bias: songs higher in the chart get a small boost
    // even if their genre is off-vibe, so we don't end up with all
    // niche tracks for cities like Manhattan where the global chart
    // dominates "pop" but the city's vibe is jazz/indie/r&b.
    const positionBoost = Math.max(0, (topSongs.length - idx) / topSongs.length);
    return { rss: song, score: cityScore * 2 + positionBoost };
  });
  scored.sort((a, b) => b.score - a.score);

  // Shuffled top-K pool — keeps RSS picks varied between buildings
  // without throwing away the genre filter.
  const poolSize = Math.max(limit * 4, 12);
  const pool = scored.slice(0, poolSize);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // Bumped from limit*2 to limit*3 — wider RSS slate so the genre
  // cap + session-shown bias have room to differentiate refreshes.
  const rssCandidates = pool.slice(0, limit * 3);
  // Capture the very-top (un-shuffled) chart positions separately so
  // the picker can guarantee one current hit per panel regardless of
  // how the random shuffle reordered the broader pool.
  const chartToppers = scored.slice(0, 5).map(s => s.rss);

  // ── Stage 2 — keyword pool (city moods + building tenants) ──
  // The city's `moodKeywords` cover scene/ethnic identity that the
  // global RSS chart usually misses (Harlem jazz, Itaewon late night,
  // LA Koreatown, etc.). The `buildingVibe.keywords` cover the
  // building's own tenant mix (Japanese restaurant → city pop, club
  // → techno, museum → ambient). Both are run as additional iTunes
  // search seeds and merged into the same scoring pool below.
  const keywordSeeds: string[] = [];
  // Pick 2-3 random city mood keywords so different buildings see
  // different long-tail picks rather than always the same ones.
  const cityMoods = [...vibe.moodKeywords];
  for (let i = cityMoods.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cityMoods[i], cityMoods[j]] = [cityMoods[j], cityMoods[i]];
  }
  keywordSeeds.push(...cityMoods.slice(0, 3));
  if (buildingVibe) keywordSeeds.push(...buildingVibe.keywords.slice(0, 3));
  // Environment-derived seeds (silent). Time-of-day + season pull in
  // one or two extra long-tail keywords so the pool shifts with the
  // moment even when the city profile and weather are unchanged.
  // Intentionally capped at 2 total so they never dominate the mix.
  const envSeeds = environmentKeywordSeeds();
  keywordSeeds.push(...envSeeds.slice(0, 2));

  // ── Stage 3 — resolve everything in parallel ──
  const [rssResolved, keywordResolved] = await Promise.all([
    Promise.all(
      rssCandidates.map(async ({ rss }) => {
        const hits = await searchTrack(
          `${rss.name} ${rss.artistName}`,
          vibe.country,
          3,
          signal,
        );
        const want = rss.name.toLowerCase().split(/\s*[\(\[]/)[0].trim();
        const match =
          hits.find((h) => h.trackName.toLowerCase().includes(want)) ||
          hits[0] ||
          null;
        if (!match || !match.previewUrl) return null;
        return match;
      }),
    ),
    Promise.all(
      keywordSeeds.map(async (seed) => {
        const hits = await searchTrack(seed, vibe.country, 3, signal);
        return hits.filter((h) => !!h.previewUrl);
      }),
    ),
  ]);

  // ── Stage 4 — merge, dedupe, balance ──
  // Strategy: alternate between RSS picks (chart proof) and keyword
  // picks (scene/tenant proof) so neither dominates the panel. The
  // alternation order is randomized per call so refresh gives
  // different ordering even for the same building.
  const rssTracks = rssResolved.filter((t): t is RecommendedTrack => !!t);
  const kwTracks = keywordResolved.flat();
  for (let i = kwTracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kwTracks[i], kwTracks[j]] = [kwTracks[j], kwTracks[i]];
  }

  const merged: RecommendedTrack[] = [];
  const seen = new Set<string>();
  // ~75% RSS, ~25% keyword — RSS is the popularity signal the spec
  // asks us to prioritize ("인기도 높은 노래 위주"). Keyword search
  // still contributes the long-tail mood tracks the chart misses,
  // but at a lighter ratio so the panel feels current, not niche.
  let rssIdx = 0;
  let kwIdx = 0;
  let tookRss = 0;
  let tookKw = 0;
  while (merged.length < limit * 4 && (rssIdx < rssTracks.length || kwIdx < kwTracks.length)) {
    const wantRss = tookRss <= tookKw * 3 || kwIdx >= kwTracks.length;
    let pick: RecommendedTrack | null = null;
    if (wantRss && rssIdx < rssTracks.length) {
      pick = rssTracks[rssIdx++];
      tookRss++;
    } else if (kwIdx < kwTracks.length) {
      pick = kwTracks[kwIdx++];
      tookKw++;
    } else if (rssIdx < rssTracks.length) {
      pick = rssTracks[rssIdx++];
      tookRss++;
    }
    if (!pick) break;
    if (seen.has(pick.id)) continue;
    seen.add(pick.id);
    merged.push(pick);
  }

  // ── Fallback ──
  // If everything above failed (RSS down + all keyword searches dry)
  // search iTunes directly for the city's top genre so the panel
  // never shows an empty list.
  if (merged.length < limit) {
    const fallback = await searchTrack(
      vibe.topGenres[0],
      vibe.country,
      (limit - merged.length) * 3,
      signal,
    );
    for (const t of fallback) {
      if (seen.has(t.id) || !t.previewUrl) continue;
      seen.add(t.id);
      merged.push(t);
      if (merged.length >= limit * 2) break;
    }
  }

  // Resolve chart-toppers to RecommendedTracks so the picker can
  // reserve a guaranteed slot. We already have most of these in the
  // pool (`rssTracks`), so we mostly cherry-pick from there to avoid
  // a second iTunes search round-trip. Anything missing falls back
  // to a single targeted search.
  const resolvedToppers: RecommendedTrack[] = [];
  for (const top of chartToppers) {
    const want = top.name.toLowerCase().split(/\s*[\(\[]/)[0].trim();
    let match = rssTracks.find((t) => t.trackName.toLowerCase().includes(want));
    if (!match) {
      try {
        const hits = await searchTrack(`${top.name} ${top.artistName}`, vibe.country, 1, signal);
        match = hits.find((h) => !!h.previewUrl) ?? hits[0];
      } catch { /* skip */ }
    }
    if (match && match.previewUrl && !resolvedToppers.some((r) => r.id === match!.id)) {
      resolvedToppers.push(match);
    }
    if (resolvedToppers.length >= 3) break;
  }

  return { vibe, tracks: merged, algorithm: 'city-vibe', context: {}, chartToppers: resolvedToppers };
}

// ─── Weather → genre mood bias ──────────────────────────────────────
// Silent system-level nudge. The user explicitly does NOT want this
// surfaced in the UI — no "Now playing rainy day jazz" labels, no
// weather chip on the panel, nothing. The recommendation engine just
// quietly lifts a couple of genres that match the current sky so the
// playlist feels right for the moment without anyone calling it out.
//
// Magnitudes are intentionally TINY (≤2) compared to the city base
// weights (which start at 6 for the top genre). The bias only re-
// orders ties and the bottom of the city's top-N — it never makes a
// rainy day in Tokyo play country.
//
// Mood mapping is psychology-101 obvious so it doesn't need a citation:
//
//   clear   → upbeat / extroverted (pop, electronic, latin, kpop)
//   cloudy  → mellow alternative / r&b
//   rain    → introspective (singer/songwriter, jazz, rnb, classical)
//   snow    → quiet / pastoral (classical, singer, soundtrack)
//   thunder → high energy / dramatic (rock, electronic, soundtrack)
//   fog     → ambient / atmospheric (electronic, classical, alternative)
//
// `windy` overlay adds a small rock/electronic kick on top of any
// category — wind = movement.
function applyWeatherBias(weights: Map<GenreKey, number>): void {
  const snap = getCurrentWeatherSnapshot();
  if (!snap) return;
  const bump = (g: GenreKey, n: number) => {
    weights.set(g, (weights.get(g) ?? 0) + n);
  };
  applyCategoryBias(snap, bump);
  if (snap.windy) {
    bump('rock', 0.5);
    bump('electronic', 0.5);
  }
  // Cold-weather subtle lift for warm cozy genres regardless of sky.
  // The user is more likely to want jazz at -5°C than at 30°C even
  // when both happen to be "clear".
  if (snap.tempC <= 5) {
    bump('jazz', 0.5);
    bump('singer', 0.5);
  }
}

function applyCategoryBias(
  snap: WeatherSnapshot,
  bump: (g: GenreKey, n: number) => void,
): void {
  switch (snap.category) {
    case 'clear':
      bump('pop', 1.2);
      bump('electronic', 1);
      bump('latin', 1);
      bump('kpop', 0.5);
      break;
    case 'cloudy':
      bump('alternative', 1);
      bump('rnb', 1);
      bump('singer', 0.5);
      break;
    case 'rain':
      bump('singer', 1.5);
      bump('jazz', 1.5);
      bump('rnb', 1);
      bump('classical', 0.5);
      break;
    case 'snow':
      bump('classical', 1.5);
      bump('singer', 1);
      bump('soundtrack', 1);
      bump('jazz', 0.5);
      break;
    case 'thunder':
      bump('rock', 1.5);
      bump('electronic', 1.5);
      bump('soundtrack', 1);
      break;
    case 'fog':
      bump('electronic', 1);
      bump('classical', 1);
      bump('alternative', 0.5);
      break;
  }
}

// ─── Time-of-day → genre mood bias ──────────────────────────────────
// Silent, same contract as `applyWeatherBias`: magnitudes ≤ ~1.5 so
// the bias only re-ranks the city's own top-N without overriding the
// city identity. Six buckets roughly aligned with how people listen:
//
//   dawn      04–07  → ambient, classical, jazz, singer
//   morning   07–11  → pop, kpop, jazz, singer        (wake / commute)
//   midday    11–16  → pop, electronic, latin         (upbeat)
//   afternoon 16–19  → rnb, alternative, hiphop       (golden hour)
//   evening   19–23  → rnb, jazz, singer, hiphop      (dinner / bar)
//   late      23–04  → electronic, hiphop, jazz, classical (night)
//
// Reads the TimeSlider snapshot. When the slider is parked at live
// time, the bucket shifts naturally through the day; when the user
// scrubs, refreshing the recommendation rolls a new playlist for
// whatever hour they landed on.
function applyTimeOfDayBias(weights: Map<GenreKey, number>): void {
  const snap = getCurrentTimeSnapshot();
  if (!snap) return;
  const bump = (g: GenreKey, n: number) => {
    weights.set(g, (weights.get(g) ?? 0) + n);
  };
  const bucket = timeBucket(snap.hour);
  switch (bucket) {
    case 'dawn':
      bump('classical', 1.2);
      bump('jazz', 1);
      bump('singer', 0.8);
      break;
    case 'morning':
      bump('pop', 1.2);
      bump('kpop', 0.8);
      bump('jazz', 0.6);
      bump('singer', 0.4);
      break;
    case 'midday':
      bump('pop', 1);
      bump('electronic', 1);
      bump('latin', 0.8);
      break;
    case 'afternoon':
      bump('rnb', 1.2);
      bump('alternative', 1);
      bump('hiphop', 0.6);
      break;
    case 'evening':
      bump('rnb', 1.2);
      bump('jazz', 1);
      bump('singer', 0.6);
      bump('hiphop', 0.4);
      break;
    case 'late':
      bump('electronic', 1.4);
      bump('hiphop', 1);
      bump('jazz', 0.8);
      bump('classical', 0.4);
      break;
  }
}

type TimeBucket =
  | 'dawn'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'late';

function timeBucket(hour: number): TimeBucket {
  if (hour >= 4 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'midday';
  if (hour >= 16 && hour < 19) return 'afternoon';
  if (hour >= 19 && hour < 23) return 'evening';
  return 'late';
}

// ─── Season → genre mood bias ───────────────────────────────────────
// Hemisphere-aware: a building at latitude +35 in July gets summer
// bias, the same latitude -35 in July gets winter bias. Southern-
// hemisphere cities are auto-flipped via `hemisphereSeason`. Near the
// equator (|lat| < 10) the signal is too weak to matter — we skip.
//
//   spring → pop, kpop, alternative     (fresh / optimistic)
//   summer → latin, electronic, pop     (heat / movement)
//   autumn → alternative, rnb, singer   (melancholy / rich)
//   winter → classical, jazz, singer    (cozy / indoor)
function applySeasonBias(weights: Map<GenreKey, number>): void {
  const snap = getCurrentTimeSnapshot();
  if (!snap) return;
  if (Math.abs(snap.lat) < 10) return; // tropics — no season signal
  const bump = (g: GenreKey, n: number) => {
    weights.set(g, (weights.get(g) ?? 0) + n);
  };
  const season = hemisphereSeason(snap.localDate, snap.lat);
  switch (season) {
    case 'spring':
      bump('pop', 0.8);
      bump('kpop', 0.6);
      bump('alternative', 0.4);
      break;
    case 'summer':
      bump('latin', 1);
      bump('electronic', 0.8);
      bump('pop', 0.6);
      break;
    case 'autumn':
      bump('alternative', 1);
      bump('rnb', 0.8);
      bump('singer', 0.6);
      break;
    case 'winter':
      bump('classical', 1);
      bump('jazz', 0.8);
      bump('singer', 0.6);
      break;
  }
}

type Season = 'spring' | 'summer' | 'autumn' | 'winter';

function hemisphereSeason(date: Date, lat: number): Season {
  // Meteorological seasons, northern hemisphere: Mar-May spring,
  // Jun-Aug summer, Sep-Nov autumn, Dec-Feb winter. Southern flips.
  const month = date.getMonth(); // 0-11
  const north =
    month >= 2 && month <= 4
      ? 'spring'
      : month >= 5 && month <= 7
        ? 'summer'
        : month >= 8 && month <= 10
          ? 'autumn'
          : 'winter';
  if (lat >= 0) return north;
  // Flip for southern hemisphere.
  return north === 'spring'
    ? 'autumn'
    : north === 'summer'
      ? 'winter'
      : north === 'autumn'
        ? 'spring'
        : 'summer';
}

// ─── Environment-derived keyword seeds ──────────────────────────────
// Generates 0-3 iTunes search seeds based on the CURRENT slider time
// + season. These are merged into the city / building keyword pool
// and resolved in parallel with everything else. The seeds are kept
// intentionally broad so iTunes Search actually returns hits across
// locales (e.g. "sunset driving" > "golden hour indie"). Randomized
// per call so refresh gives different long-tail picks.
function environmentKeywordSeeds(): string[] {
  const snap = getCurrentTimeSnapshot();
  if (!snap) return [];
  const timeSeeds = timeBucketKeywords(timeBucket(snap.hour));
  const seasonSeeds =
    Math.abs(snap.lat) >= 10
      ? seasonKeywords(hemisphereSeason(snap.localDate, snap.lat))
      : [];
  // Shuffle each pool independently, then pick at most 1 from each
  // so we never flood the keyword mix with env-only seeds.
  const pick = (pool: string[]): string | null => {
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  };
  const seeds: string[] = [];
  const t = pick(timeSeeds);
  if (t) seeds.push(t);
  const s = pick(seasonSeeds);
  if (s) seeds.push(s);
  return seeds;
}

function timeBucketKeywords(b: TimeBucket): string[] {
  switch (b) {
    case 'dawn':
      return ['sunrise ambient', 'morning classical', 'quiet piano'];
    case 'morning':
      return ['morning coffee', 'wake up pop', 'commute indie'];
    case 'midday':
      return ['daytime pop', 'afternoon drive', 'sunshine latin'];
    case 'afternoon':
      return ['golden hour', 'sunset chill', 'late afternoon rnb'];
    case 'evening':
      return ['dinner jazz', 'evening lounge', 'sunset rnb'];
    case 'late':
      return ['late night lofi', 'midnight jazz', '3am drive', 'after hours'];
  }
}

function seasonKeywords(s: Season): string[] {
  switch (s) {
    case 'spring':
      return ['spring pop', 'cherry blossom', 'fresh start'];
    case 'summer':
      return ['summer latin', 'beach pop', 'summer night'];
    case 'autumn':
      return ['autumn indie', 'rainy day', 'fall playlist'];
    case 'winter':
      return ['winter jazz', 'cozy classical', 'fireplace'];
  }
}

// Re-export for convenience.
export type { CountryCode, RecommendedTrack, CityVibe };
