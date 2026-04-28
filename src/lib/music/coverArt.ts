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

export type ResolvedCover = {
  artworkUrl: string;          // Apple CDN, already 1200×1200
  previewUrl?: string;
  trackViewUrl?: string;       // canonical music.apple.com link
  matchScore: number;          // 0-100; 100 = deterministic id lookup
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
  /\b(remix|cover|karaoke|tribute|live|instrumental|acoustic|remaster(?:ed)?|edit|version|mix|sped\s*up|slowed)\b/i;

function score(
  candidate: { trackName: string; artistName: string },
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
    // Allow comma / & / "feat" / "and" / "x" splits — collaborator
    // listings often differ between Apple's metadata and what was
    // typed at seed time.
    const parts = ca
      .split(/[,&]| and | x | feat | featuring /)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.some((p) => p === wa || p.includes(wa) || wa.includes(p))) s += 32;
  }

  // ── Variant penalty ──
  // If the user asked for "Stay With Me" and Apple returned
  // "Stay With Me (Karaoke Version)", drop 45 points so it falls
  // out of the MIN_SCORE acceptance band.
  const wantedVariant = VARIANT_RE.test(want.trackName);
  const gotVariant = VARIANT_RE.test(candidate.trackName);
  if (gotVariant && !wantedVariant) s -= 45;

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
  if (opts?.trackId !== undefined) {
    const idStr = String(opts.trackId).trim();
    if (/^\d{6,12}$/.test(idStr)) {
      const hit = await lookupTrackId(idStr);
      if (hit) {
        return {
          artworkUrl: hit.artworkUrl,
          previewUrl: hit.previewUrl || undefined,
          trackViewUrl: hit.trackViewUrl || undefined,
          matchScore: 100,
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
    try { results = await searchTrack(term, cc, 10); } catch { /* network — try next */ }
    for (const r of results) {
      const s = score(r, want);
      if (!best || s > best.score) best = { score: s, track: r };
    }
    // Already a strong hit — no need to query more storefronts.
    if (best && best.score >= 95) break;
  }

  if (!best || best.score < MIN_SCORE) return null;

  return {
    artworkUrl: best.track.artworkUrl,
    previewUrl: best.track.previewUrl || undefined,
    trackViewUrl: best.track.trackViewUrl || undefined,
    matchScore: best.score,
  };
}
