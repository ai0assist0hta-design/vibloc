/**
 * MusicBrainz + Cover Art Archive lookup.
 *
 * MusicBrainz is the open-source music encyclopedia (CC0 data,
 * volunteer-edited, used by Spotify / BBC / Last.fm internally).
 * Each *recording* (= unique master) has a stable MBID, and most
 * recordings are linked to one or more *releases* (= album
 * pressings) whose covers live on the Cover Art Archive — a free,
 * CORS-enabled image host run by archive.org.
 *
 * Why this module exists
 * ----------------------
 * iTunes Search sometimes ranks the wrong song first when the
 * (artist, title) query is ambiguous. MusicBrainz indexes by
 * canonical metadata + Lucene-style boolean queries, so a
 * `recording:"X" AND artist:"Y"` query returns the right MBID
 * with very high precision.
 *
 * Once we have the MBID, Cover Art Archive returns the front
 * cover image at any size via a deterministic URL:
 *   https://coverartarchive.org/release/{MBID}/front-{N}
 *
 * Trade-offs documented in the research:
 * - Rate limit: 1 req/sec for anonymous clients. We chain through
 *   a single-slot queue with a 1100 ms gap.
 * - The cover may be a different release (different country
 *   pressing) than what Apple Music shows for the same recording —
 *   this is the *open-source* source of truth, intentionally.
 *   Useful when Apple has the wrong art ranked first or the song
 *   isn't on Apple at all.
 * - CORS is officially supported on both `musicbrainz.org/ws/2`
 *   and `coverartarchive.org` (verified in MBS-2979).
 *
 * Returns null when no high-confidence MBID is found OR when the
 * release has no cover art on file.
 */

const MB_BASE = 'https://musicbrainz.org/ws/2';
const CAA_BASE = 'https://coverartarchive.org';

// ─── 1 req/sec throttle ──────────────────────────────────────────────
//
// Browsers can't override User-Agent so we live with the strict
// anonymous limit. A single chained promise serializes every call.

let mbChain: Promise<unknown> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const next = mbChain
    .catch(() => undefined)
    .then(() => fn())
    .finally(() => new Promise<void>((r) => setTimeout(r, 1100)));
  mbChain = next;
  return next as Promise<T>;
}

// ─── Recording search ────────────────────────────────────────────────

type MBRecording = {
  id: string;          // MBID (UUID)
  score?: number;      // 0–100 Lucene score
  title: string;
  length?: number;
  'artist-credit'?: { name: string; artist?: { id: string; name: string } }[];
  releases?: {
    id: string;
    title?: string;
    status?: string;   // "Official" / "Bootleg" / etc.
    'release-group'?: { id: string; 'primary-type'?: string };
  }[];
};

type MBSearchResponse = { recordings?: MBRecording[] };

/** Build a Lucene query that puts strong weight on artist + title
 *  while tolerating loose punctuation. Quoting forces phrase match. */
function buildQuery(artist: string, title: string): string {
  // Strip MB-special characters that would otherwise need escaping.
  const a = artist.replace(/["+\-!(){}[\]^~*?:\\/]/g, ' ').trim();
  const t = title.replace(/["+\-!(){}[\]^~*?:\\/]/g, ' ').trim();
  return `recording:"${t}" AND artist:"${a}"`;
}

/** Search MusicBrainz for a recording matching (artist, title).
 *  Returns top N hits sorted by MB's own Lucene score. Cached at
 *  the browser-fetch level via the Cache-Control headers MB serves. */
export async function searchRecording(
  artist: string,
  title: string,
  limit = 5,
): Promise<MBRecording[]> {
  if (!artist.trim() || !title.trim()) return [];
  const q = buildQuery(artist, title);
  const url = `${MB_BASE}/recording/?query=${encodeURIComponent(q)}`
            + `&limit=${limit}&fmt=json`;
  return throttled(async () => {
    try {
      const r = await fetch(url, { credentials: 'omit' });
      if (!r.ok) return [];
      const data = (await r.json()) as MBSearchResponse;
      return data.recordings ?? [];
    } catch {
      return [];
    }
  });
}

// ─── Cover Art Archive ───────────────────────────────────────────────

/** Resolve a release MBID to its front cover image URL. Returns the
 *  *redirected* URL (an archive.org S3 path) so the caller can put
 *  it straight into an <img src> without an extra round-trip.
 *
 *  Sizes: 250, 500, 1200. Use 500 for thumbs, 1200 for hero covers.
 *  Returns null if the release has no cover art on file. */
export async function coverArtUrl(
  releaseMbid: string,
  size: 250 | 500 | 1200 = 500,
): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(releaseMbid)) return null;
  const url = `${CAA_BASE}/release/${releaseMbid}/front-${size}`;
  // CAA responds with 307 → the actual image. We just need to know
  // whether the image exists; HEAD is cheaper than GET. We don't
  // throttle this through `mbChain` because CAA / archive.org has
  // its own (much higher) rate limit.
  try {
    const r = await fetch(url, { method: 'HEAD', credentials: 'omit' });
    if (!r.ok) return null;
    // r.url contains the final URL after redirect — that's what we
    // hand to the <img>. Falls back to the canonical URL if the
    // browser decided not to follow.
    return r.url || url;
  } catch {
    return null;
  }
}

// ─── Composite: artist + title → cover URL ──────────────────────────

/** End-to-end: search MusicBrainz for the recording, walk its
 *  releases (Official first), and return the first cover that
 *  exists on Cover Art Archive. Returns null when nothing matches
 *  or no release has artwork.
 *
 *  This is the entry point the cover-art tier in `coverArt.ts`
 *  calls — keeps all MB-specific logic in one file. */
export async function findCoverArt(
  artist: string,
  title: string,
  size: 250 | 500 | 1200 = 1200,
): Promise<string | null> {
  const recordings = await searchRecording(artist, title, 5);
  if (!recordings.length) return null;

  // Keep only high-confidence MB matches (score ≥ 90). MB's score
  // is a Lucene relevance score, not a normalized similarity, but
  // empirically ≥ 90 = same recording.
  const ranked = recordings
    .filter((r) => (r.score ?? 0) >= 90)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  for (const rec of ranked) {
    // Prefer official releases over bootlegs / promos.
    const releases = (rec.releases ?? [])
      .slice()
      .sort((a, b) => {
        const oa = a.status === 'Official' ? 0 : 1;
        const ob = b.status === 'Official' ? 0 : 1;
        return oa - ob;
      });
    for (const rel of releases) {
      const url = await coverArtUrl(rel.id, size);
      if (url) return url;
    }
  }
  return null;
}
