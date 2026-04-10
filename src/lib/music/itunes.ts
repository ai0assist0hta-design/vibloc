/**
 * iTunes Search + RSS adapter — the ONLY music source we ship.
 *
 * CLAUDE.md §5 already locked iTunes in as the canonical music API
 * because:
 *   • Free, no key, no developer account, no per-user cap
 *   • Returns a 30-second m4a `previewUrl` we can drop into <audio>
 *   • Returns `artworkUrl100` we can hot-link
 *   • Spotify deprecated audio-features (Nov 2024) and capped dev
 *     mode at 25 users (May 2025) — not a path forward
 *
 * This module exposes the two endpoints we actually need:
 *
 *   1. searchTrack(q, country)  — `iTunes Search API`
 *      Used by the recommendation engine to look up real tracks once
 *      we have a (genre|artist) seed, and used by the future
 *      composer for free-text track lookup.
 *
 *   2. topSongsByCountry(country) — Apple Marketing Tools RSS feed
 *      Used by the recommendation engine to seed the City Vibe
 *      block. Returns the 25 most-played songs in the country's
 *      Apple Music store. Also free, also no key, also CORS-OK.
 *
 * Cost: 0원. No keys, no billing, no quotas beyond Apple's own
 * polite-use rate limit (~20 req/min). We honor that with a tiny
 * sessionStorage cache + a 300 ms debounce in the composer (TODO).
 */

import type { RecommendedTrack } from './trackTypes';
import { normalizeGenre } from './normalizeGenre';

const SEARCH_ENDPOINT = 'https://itunes.apple.com/search';
const RSS_ENDPOINT = 'https://rss.applemarketingtools.com/api/v2';

/** ISO 3166-1 alpha-2 — matches the existing AREA_COUNTRY map in App.tsx. */
export type CountryCode = 'JP' | 'KR' | 'US';

// ─── Tiny in-memory cache ───────────────────────────────────────────
// sessionStorage gives us per-tab persistence with zero deps. Keys
// are namespaced so they don't collide with anything else the app
// stores. TTL is enforced inline; no background eviction needed.
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(`vibloc.music.v2.${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; v: T };
    if (Date.now() - parsed.t > CACHE_TTL_MS) return null;
    return parsed.v;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(
      `vibloc.music.v2.${key}`,
      JSON.stringify({ t: Date.now(), v: value }),
    );
  } catch {
    /* sessionStorage full / disabled — ignore */
  }
}

// ─── Raw iTunes Search response shape ───────────────────────────────
type ItunesRawResult = {
  trackId: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  primaryGenreName?: string;
  trackViewUrl?: string;
  wrapperType?: string;
  kind?: string;
};

function toRecommendedTrack(r: ItunesRawResult): RecommendedTrack | null {
  if (!r.trackName || !r.artistName) return null;
  // Apple's default artwork URL is 100 px. The 600 px variant is just
  // a string substitution and the CDN serves it for free — sharper on
  // retina without an extra request.
  const art = (r.artworkUrl100 || '').replace('100x100bb', '600x600bb');
  return {
    id: String(r.trackId),
    trackName: r.trackName,
    artistName: r.artistName,
    artworkUrl: art,
    previewUrl: r.previewUrl || '',
    primaryGenreName: r.primaryGenreName || '',
    genre: normalizeGenre(r.primaryGenreName || ''),
    trackViewUrl: r.trackViewUrl || '',
  };
}

/**
 * Search the iTunes catalog for tracks matching `query`. Country
 * scopes the search to a specific Apple Music store so a search for
 * "city pop" in JP returns Japanese results, not the global default.
 *
 * Returns at most `limit` tracks (default 10). Empty array on
 * network failure — never throws, never blocks the UI.
 */
export async function searchTrack(
  query: string,
  country: CountryCode = 'US',
  limit = 10,
  signal?: AbortSignal,
): Promise<RecommendedTrack[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const cacheKey = `search|${country}|${limit}|${cleanQuery.toLowerCase()}`;
  const cached = cacheGet<RecommendedTrack[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    term: cleanQuery,
    media: 'music',
    entity: 'song',
    country: country.toLowerCase(),
    limit: String(limit),
  });

  try {
    const res = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
      signal,
      credentials: 'omit',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ItunesRawResult[] };
    const tracks = (data.results || [])
      .map(toRecommendedTrack)
      .filter((t): t is RecommendedTrack => t !== null);
    cacheSet(cacheKey, tracks);
    return tracks;
  } catch {
    return [];
  }
}

// ─── Apple RSS Top Songs ────────────────────────────────────────────
// The Apple Marketing Tools RSS feed returns the top N songs in a
// given country's Apple Music store. No key. CORS allowed. The shape
// is different from iTunes Search — different field names, no
// trackId, etc. — so we normalize separately.

type RssFeedItem = {
  id: string;          // e.g. "1234567890"
  name: string;        // track title
  artistName: string;
  artworkUrl100: string;
  url: string;         // Apple Music page
  genres?: { genreId: string; name: string }[];
};

type RssFeedResponse = {
  feed?: {
    results?: RssFeedItem[];
  };
};

/**
 * Fetch the top `limit` most-played songs in the given country. The
 * Apple Marketing Tools RSS endpoint is documented at
 * `rss.applemarketingtools.com` and is free + key-free + CORS-OK.
 *
 * Note: the RSS feed does NOT include `previewUrl`. We resolve a
 * preview by re-querying iTunes Search with `${name} ${artist}` for
 * each track that the engine actually wants to surface — that's why
 * the engine fetches a small N here (default 25) and then narrows.
 */
export async function topSongsByCountry(
  country: CountryCode,
  limit = 25,
  signal?: AbortSignal,
): Promise<{
  id: string;
  name: string;
  artistName: string;
  artworkUrl: string;
  primaryGenreName: string;
}[]> {
  const cacheKey = `top|${country}|${limit}`;
  const cached = cacheGet<{
    id: string;
    name: string;
    artistName: string;
    artworkUrl: string;
    primaryGenreName: string;
  }[]>(cacheKey);
  if (cached) return cached;

  const url = `${RSS_ENDPOINT}/${country.toLowerCase()}/music/most-played/${limit}/songs.json`;
  try {
    const res = await fetch(url, { signal, credentials: 'omit' });
    if (!res.ok) return [];
    const data = (await res.json()) as RssFeedResponse;
    const items = (data.feed?.results || []).map((it) => ({
      id: it.id,
      name: it.name,
      artistName: it.artistName,
      artworkUrl: (it.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
      primaryGenreName: it.genres?.[0]?.name || '',
    }));
    cacheSet(cacheKey, items);
    return items;
  } catch {
    return [];
  }
}
