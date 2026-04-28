/**
 * Seed-track artwork enricher.
 *
 * The demo personas in `seedAgents.ts` ship with `picsum.photos`
 * placeholder covers so the first paint is instant and offline-safe.
 * This module runs in the background after seeding and progressively
 * replaces those placeholders with real iTunes Search API data
 * (artwork, preview, trackViewUrl) so the playlist UI ends up
 * looking like actual Apple Music.
 *
 * Design decisions:
 *
 * - Runs **after** the synchronous seed write, so the UI never blocks
 *   on the network.
 * - Dedups by `${artistName}|${trackName}` — many personas pin the
 *   same songs, no point hitting iTunes twice.
 * - Caches each successful lookup in localStorage under
 *   `vibloc.seed.appleCache.v1` so subsequent boots skip the network
 *   round-trip entirely.
 * - Respects the existing `searchTrack()` in-memory cache so even
 *   un-cached results dedupe at the request layer.
 * - Throttles to 4 concurrent requests so we don't trip the iTunes
 *   "20 requests per minute" soft limit.
 * - Only mutates entries that still look unenriched (artworkUrl
 *   contains `picsum`); user-pinned tracks are never touched.
 * - Triggers `reloadFromStorage()` once after the batch so the UI
 *   re-renders in a single pass instead of flashing per track.
 */

import { type CountryCode } from '../../lib/music/itunes';
import { resolveCover } from '../../lib/music/coverArt';
import { reloadFromStorage } from '../../lib/music/buildingPlaylist';

const STORAGE_KEY = 'vibloc.playlists.v2';
// v4 = MusicBrainz + Cover Art Archive fallback added. Bumping the
// cache key forces a one-time re-resolve so any track that iTunes
// couldn't match (and was sitting on a placeholder) gets a chance
// at the open-source cover.
const APPLE_CACHE_KEY = 'vibloc.seed.appleCache.v4';
const PLACEHOLDER_HOST = 'picsum.photos';

type EnrichedFields = {
  artworkUrl: string;
  previewUrl?: string;
  trackViewUrl?: string;
};

// `null` cache entry = "we tried and Apple has no confident match" —
// stops us re-hitting iTunes every boot for impossible-to-match seeds.
type AppleCache = Record<string, EnrichedFields | null>; // key = lowercased "artist|track"

/** Read the persistent cache of resolved iTunes results. */
function readCache(): AppleCache {
  try {
    const raw = localStorage.getItem(APPLE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as AppleCache;
  } catch { /* corrupted — start fresh */ }
  return {};
}

function writeCache(c: AppleCache): void {
  try { localStorage.setItem(APPLE_CACHE_KEY, JSON.stringify(c)); }
  catch { /* quota / private mode — ignore */ }
}

function cacheKey(artistName: string, trackName: string): string {
  return `${artistName.trim().toLowerCase()}|${trackName.trim().toLowerCase()}`;
}

/** Resolve via `resolveCover` — uses iTunes lookup?id=… directly
 *  when `trackId` is a real numeric id (deterministic, byte-perfect
 *  match to Apple Music). Falls back to scored search otherwise. */
async function lookupOne(
  artistName: string,
  trackName: string,
  country: CountryCode,
  opts?: { trackId?: string; genre?: string },
): Promise<EnrichedFields | null> {
  const hit = await resolveCover(artistName, trackName, country, opts);
  if (!hit) return null;
  return {
    artworkUrl: hit.artworkUrl,
    previewUrl: hit.previewUrl,
    trackViewUrl: hit.trackViewUrl,
  };
}

/** Run N async tasks with at most `concurrency` in flight at once. */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency = 4,
): Promise<T[]> {
  const out: T[] = [];
  let i = 0;
  async function worker(): Promise<void> {
    while (i < tasks.length) {
      const idx = i++;
      try { out[idx] = await tasks[idx](); }
      catch { /* swallow — best-effort */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return out;
}

/** Public entry point. Safe to call any number of times — already
 *  enriched tracks are skipped by URL inspection. Country defaults
 *  to US; pass the area's country to bias regional matches. */
export function enrichSeedArtworkInBackground(country: CountryCode = 'US'): void {
  if (typeof window === 'undefined') return;
  // Defer to next tick so we never race the synchronous seed write.
  setTimeout(() => { void runEnricher(country); }, 0);
}

async function runEnricher(country: CountryCode): Promise<void> {
  let raw: string | null = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { return; }
  if (!raw) return;

  let store: Record<string, { tracks: Array<Record<string, unknown>> }>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return;
    store = parsed as typeof store;
  } catch { return; }

  const cache = readCache();
  // Collect the unique (artist, track) pairs that still need work.
  // We also remember the seed `id` (often an iTunes trackId) and
  // `genre` so resolveCover can take the deterministic Tier-0 path.
  const need = new Map<string, { artist: string; track: string; id?: string; genre?: string }>();
  for (const entry of Object.values(store)) {
    const tracks = entry?.tracks;
    if (!Array.isArray(tracks)) continue;
    for (const t of tracks) {
      const url = String(t.artworkUrl ?? '');
      if (!url || !url.includes(PLACEHOLDER_HOST)) continue;
      const artist = String(t.artistName ?? '').trim();
      const track = String(t.trackName ?? '').trim();
      if (!artist || !track) continue;
      const key = cacheKey(artist, track);
      if (cache[key]) continue; // already resolved last boot
      if (!need.has(key)) {
        need.set(key, {
          artist, track,
          id: String(t.id ?? '').trim() || undefined,
          genre: String(t.genre ?? '').trim() || undefined,
        });
      }
    }
  }

  // Already cached from a previous session? Apply immediately, no
  // network. Otherwise spin up the throttled lookups. Negative
  // results are recorded as `null` so we don't keep retrying
  // unmatchable seeds every boot.
  let mutated = false;
  if (need.size > 0) {
    const tasks = Array.from(need.entries()).map(([key, { artist, track, id, genre }]) => async () => {
      const hit = await lookupOne(artist, track, country, { trackId: id, genre });
      cache[key] = hit; // hit OR null — both worth caching
    });
    await runWithConcurrency(tasks, 4);
    writeCache(cache);
  }

  // Walk the store again and mutate any tracks that we now have data
  // for. This is the *single* write back to localStorage so the UI
  // re-renders once. Tracks whose lookup returned null keep their
  // placeholder — better than showing the wrong song's cover.
  for (const entry of Object.values(store)) {
    const tracks = entry?.tracks;
    if (!Array.isArray(tracks)) continue;
    for (const t of tracks) {
      const url = String(t.artworkUrl ?? '');
      if (!url || !url.includes(PLACEHOLDER_HOST)) continue;
      const key = cacheKey(String(t.artistName ?? ''), String(t.trackName ?? ''));
      const hit = cache[key];
      if (!hit) continue;
      t.artworkUrl = hit.artworkUrl;
      if (hit.previewUrl && !t.previewUrl) t.previewUrl = hit.previewUrl;
      if (hit.trackViewUrl && !t.trackViewUrl) t.trackViewUrl = hit.trackViewUrl;
      mutated = true;
    }
  }

  if (!mutated) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
  catch { return; }
  reloadFromStorage();
}
