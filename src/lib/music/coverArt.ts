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

import { searchTrack, type CountryCode } from './itunes';

export type ResolvedCover = {
  artworkUrl: string;          // Apple CDN, already 1200×1200
  previewUrl?: string;
  trackViewUrl?: string;       // canonical music.apple.com link
  matchScore: number;          // 0-100, debug / telemetry
};

const MIN_SCORE = 80;

// ─── Text normalization ──────────────────────────────────────────────

/** Lower-case, strip diacritics, drop parentheticals + bracketed +
 *  "feat. xyz" tails, collapse whitespace. Comparing
 *  "Around the World (12-inch mix)" vs "Around The World" should
 *  treat them as title-equivalent. */
function normalize(s: string): string {
  return s
    .toLowerCase()
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
 *  (artist, track) pair. Returns null when no storefront produced a
 *  match scoring at least MIN_SCORE — the caller should leave the
 *  existing artwork alone in that case rather than swapping in the
 *  wrong song. */
export async function resolveCover(
  artistName: string,
  trackName: string,
  country: CountryCode = 'US',
): Promise<ResolvedCover | null> {
  const a = artistName.trim();
  const t = trackName.trim();
  if (!a || !t) return null;

  const want = { artistName: a, trackName: t };
  const term = `${t} ${a}`.trim();

  // Try the regional storefront first (better local matches for
  // Japanese / Korean catalogs which differ from the US one), then
  // a few global fallbacks. Each search is itself memoized by
  // `searchTrack`, so duplicates across storefronts are cheap.
  const STOREFRONTS: CountryCode[] = Array.from(new Set<CountryCode>(
    [country, 'US', 'JP', 'KR'],
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
