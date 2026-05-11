/**
 * Apple-only cover-art lookup with strict matching.
 *
 * Goal: the artwork shown in VIBLOC must be **exactly** the cover
 * Apple Music renders for that same song. That means a single
 * source-of-truth — iTunes Search API (= Apple's catalog) — with
 * matching strict enough to avoid karaoke / live / cover / wrong-
 * artist hits. No MusicBrainz / Cover Art Archive fallback because
 * those return different release pressings whose art often differs
 * from Apple's chosen storefront image.
 *
 * Strategy:
 *
 *   1. Hit iTunes Search across multiple country storefronts
 *      (preferred + US + JP + KR), each call already cached by
 *      `searchTrack`.
 *   2. Score every result with a normalized title/artist comparison
 *      that penalizes remix / cover / karaoke / instrumental / live
 *      / remastered / acoustic UNLESS the query asked for them.
 *   3. Best score across all storefronts wins, and only ≥ MIN_SCORE
 *      is accepted. Below threshold → return null and the caller
 *      keeps whatever placeholder it had.
 *
 * Returns the iTunes track URL too, so the caller can wire up the
 * Apple Music deep link with confidence — same matched ID, same
 * cover, same Apple page.
 */

import { lookupTrackId, searchTrack, type CountryCode } from './itunes';
import { findCoverArt as findMusicBrainzCover } from './musicbrainz';

export type ResolvedCover = {
  artworkUrl: string;          // Apple CDN OR Cover Art Archive (open-source)
  previewUrl?: string;
  trackViewUrl?: string;       // canonical music.apple.com link (only for Apple sources)
  matchScore: number;          // 0-100; 100 = deterministic id lookup
  source: 'itunes-id' | 'itunes-search' | 'musicbrainz';
};

const MIN_SCORE = 80;

// ─── Storefront auto-detection ───────────────────────────────────────
//
// iTunes Search results vary wildly by `country` storefront. A
// Japanese-language song queried against the US store often surfaces
// English-language remixes / covers / unrelated tracks first; the
// JP store returns the canonical version on the first hit.
//
// We pick a storefront BY TRACK (not by user / building) because the
// natural locale of the song dominates which Apple Music store has
// the canonical metadata. Detection rules:
//
//   - any Hangul char           → KR
//   - any Hiragana/Katakana     → JP
//   - any CJK ideograph         → check artist for Hangul too;
//                                 Hangul artist + kanji title still wins KR
//   - genre keyword 'kpop'      → KR
//   - genre keyword 'jpop'      → JP
//   - else                      → fallback to caller-supplied country

const HANGUL_RE = /[가-힯ᄀ-ᇿ]/;
const KANA_RE   = /[぀-ヿ]/;
const CJK_RE    = /[㐀-鿿]/;

export function detectStorefront(
  trackName: string,
  artistName: string,
  fallback: CountryCode = 'US',
  genre?: string,
): CountryCode {
  const both = `${trackName} ${artistName}`;
  if (HANGUL_RE.test(both)) return 'KR';
  if (KANA_RE.test(both)) return 'JP';
  if (genre === 'kpop') return 'KR';
  if (genre === 'jpop') return 'JP';
  // Pure CJK ideographs (no kana) → mostly Chinese / classical
  // Japanese — bias toward JP since VIBLOC's J-pop seeds outnumber
  // any zh-CN content in the pool.
  if (CJK_RE.test(both)) return 'JP';
  return fallback;
}

// ─── Text normalization ──────────────────────────────────────────────

/** Lower-case, strip diacritics, drop parentheticals + bracketed +
 *  "feat. xyz" tails, collapse whitespace. Comparing
 *  "Around the World (12-inch mix)" vs "Around The World" should
 *  treat them as title-equivalent. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    // NFD splits Latin "é" into "e" + U+0301 so we can drop the
    // combining mark below. CJK characters pass through unchanged
    // (NFD does NOT decompose Han / Hiragana / Katakana / Hangul
    // syllables to jamos under default options).
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\bfeat\.?\b.*$/i, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const VARIANT_RE =
  /\b(remix|cover|karaoke|tribute|live|instrumental|acoustic|remaster(?:ed)?|edit|version|mix|sped\s*up|slowed|deluxe edition)\b/i;

const COMPILATION_RE =
  /\b(compilation|various artists|now that's what|hits|greatest|the best of|deluxe|bonus track|anniversary|reissue|collection|dj\s*mix|boiler\s*room|today'?s hits|workout|playlist|mixed by|ministry of sound|continuous mix|pres\.|presents)\b/i;

function score(
  candidate: {
    trackName: string;
    artistName: string;
    collectionName?: string;
    trackCount?: number;
    releaseDate?: string;
  },
  want: { trackName: string; artistName: string },
): number {
  const ct = normalize(candidate.trackName);
  const ca = normalize(candidate.artistName);
  const wt = normalize(want.trackName);
  const wa = normalize(want.artistName);
  let s = 0;

  // ── Title match (50) ──
  if (ct === wt) s += 50;
  else if (ct.startsWith(wt) || wt.startsWith(ct)) s += 35;
  else if (ct.includes(wt) || wt.includes(ct)) s += 22;

  // ── Artist match (50) ──
  if (ca === wa) s += 50;
  else if (ca.includes(wa) || wa.includes(ca)) s += 38;
  else {
    const parts = ca
      .split(/[,&]| and | x | feat | featuring /)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.some((p) => p === wa || p.includes(wa) || wa.includes(p))) s += 32;
  }

  // ── Variant penalty (raised −45 → −60) ──
  // Karaoke / Live / Instrumental / Remaster / Acoustic / Edit are
  // wrong covers ~always. Stronger penalty so they fall well below
  // any "(Original)" alternative that scored equal on title+artist.
  const wantedVariant = VARIANT_RE.test(want.trackName);
  const gotVariant = VARIANT_RE.test(candidate.trackName);
  if (gotVariant && !wantedVariant) s -= 60;

  // ── Collection-shape bonus (new) ──
  // The same song exists across many collections (single, OST,
  // studio album, deluxe, compilation, best-of). Apple's
  // `artworkUrl100` is the collection cover, NOT a per-track
  // image — so picking the right collection IS picking the right
  // cover. Heuristics: a Single (trackCount === 1) is usually the
  // canonical first release of the song, the earliest releaseDate
  // wins ties, and any compilation / "best of" / "deluxe" gets
  // pushed down.
  if (candidate.trackCount === 1) s += 8; // single
  if (candidate.collectionName) {
    if (COMPILATION_RE.test(candidate.collectionName)) s -= 20;
    // OST / Soundtrack collections are a legitimate canonical
    // home for many songs (Spider-Verse, Lost in Translation),
    // so we don't penalize them — but we don't bonus either.
  }
  if (candidate.releaseDate) {
    // Earlier release = closer to the original, preferred when
    // everything else is equal. ~5 points spread across two
    // decades; keeps the signal mild so it can't override title /
    // artist matching.
    const yr = new Date(candidate.releaseDate).getFullYear();
    if (!Number.isNaN(yr)) {
      const ageYears = new Date().getFullYear() - yr;
      s += Math.min(5, Math.max(0, ageYears / 5));
    }
  }

  return s;
}

// ─── Public API ──────────────────────────────────────────────────────

/** Resolve the *Apple Music* cover (and matching deep link) for an
 *  (artist, track) pair.
 *
 *  Two-tier strategy:
 *
 *   - Tier 0 (deterministic): if `opts.trackId` is supplied AND
 *     looks like a real iTunes id (6–12 digits), call lookup?id=…
 *     and return whatever Apple says. matchScore = 100, no scoring,
 *     no ambiguity. This is the path Apple Music's own pages use,
 *     so the cover and trackViewUrl are byte-identical to what the
 *     user sees on music.apple.com.
 *
 *   - Tier 1 (scored search): if no id (or id lookup fails),
 *     search across the auto-detected storefront + global
 *     fallbacks, score every result with normalized title/artist
 *     comparison + variant penalty, return only ≥ MIN_SCORE.
 *
 *  Returns null when neither tier produces a confident match — the
 *  caller should leave the existing artwork alone in that case
 *  rather than swapping in the wrong song. */
export async function resolveCover(
  artistName: string,
  trackName: string,
  country: CountryCode = 'US',
  opts?: { trackId?: string | number; genre?: string },
): Promise<ResolvedCover | null> {
  const a = artistName.trim();
  const t = trackName.trim();
  if (!a || !t) return null;

  // ── Tier 0: deterministic id lookup ──
  // Country detection: a JP-only release (Pocket Park 2008 Remastered)
  // returns 0 results from the US store. Detect script + genre and
  // route the lookup through the matching storefront so the trackId
  // resolves byte-for-byte to the cover Apple shows in that region.
  if (opts?.trackId !== undefined) {
    const idStr = String(opts.trackId).trim();
    if (/^\d{6,12}$/.test(idStr)) {
      const lookupCountry = detectStorefront(t, a, country, opts?.genre);
      // Sequential fallback so each call is short-circuited on hit.
      let hit = await lookupTrackId(idStr, lookupCountry);
      if (!hit && lookupCountry !== 'US') hit = await lookupTrackId(idStr, 'US');
      if (!hit) hit = await lookupTrackId(idStr); // bare, no country
      if (hit) {
        return {
          artworkUrl: hit.artworkUrl,
          previewUrl: hit.previewUrl || undefined,
          trackViewUrl: hit.trackViewUrl || undefined,
          matchScore: 100,
          source: 'itunes-id',
        };
      }
      // id was supplied but lookup returned nothing — fall through
      // to scored search rather than failing outright.
    }
  }

  // ── Tier 1: scored search ──
  const want = { artistName: a, trackName: t };
  const term = `${t} ${a}`.trim();

  // Detect the canonical storefront for this track (script + genre)
  // and try it first — that single change fixes most J-pop / K-pop
  // mismatches that surfaced when an English-store search happened
  // to put a different YOASOBI / NewJeans song first. Then fall
  // through to other stores.
  const primary = detectStorefront(t, a, country, opts?.genre);
  const STOREFRONTS: CountryCode[] = Array.from(new Set<CountryCode>(
    [primary, country, 'US', 'JP', 'KR'],
  ));

  let best: { score: number; track: Awaited<ReturnType<typeof searchTrack>>[number] } | null = null;
  for (const cc of STOREFRONTS) {
    let results: Awaited<ReturnType<typeof searchTrack>> = [];
    try { results = await searchTrack(term, cc, 10); }
    catch (e) {
      if (import.meta.env.DEV) console.warn(`[cover] iTunes search failed (${cc})`, e);
      /* network — try next storefront */
    }
    for (const r of results) {
      const s = score(r, want);
      if (!best || s > best.score) best = { score: s, track: r };
    }
    // Already a strong hit — no need to query more storefronts.
    if (best && best.score >= 95) break;
  }

  if (best && best.score >= MIN_SCORE) {
    return {
      artworkUrl: best.track.artworkUrl,
      previewUrl: best.track.previewUrl || undefined,
      trackViewUrl: best.track.trackViewUrl || undefined,
      matchScore: best.score,
      source: 'itunes-search',
    };
  }

  // ── Tier 2: open-source MusicBrainz + Cover Art Archive ──
  // Last-resort. Hits when iTunes either ranks the wrong song first
  // or doesn't carry the recording at all (long-tail / indie /
  // regional releases). MusicBrainz uses Lucene-style boolean
  // search which is far more precise for ambiguous queries, and
  // Cover Art Archive is CC-licensed open data so we hot-link the
  // resulting image with no quota worries.
  //
  // Trade-off: the artwork is the open-source community's chosen
  // release pressing for the recording, which may differ from
  // Apple's storefront cover. We accept that — better an authentic
  // cover from a different release than the wrong song's cover.
  try {
    const mbCover = await findMusicBrainzCover(a, t, 1200);
    if (mbCover) {
      return {
        artworkUrl: mbCover,
        matchScore: 90,
        source: 'musicbrainz',
        // No previewUrl / trackViewUrl from MB. Caller keeps any
        // existing preview link if it already had one.
      };
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[cover] MusicBrainz fallback failed', e);
    /* best-effort, fall through to null */
  }

  return null;
}
