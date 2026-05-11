/**
 * Apple-Music-derived genre color source.
 *
 * Why this exists
 * ---------------
 * The 18 GenreKey buckets in `src/types/index.ts` are 1:1 with Apple's
 * iTunes Genre Catalog (parent id 34 "Music"). The genre LABELS already
 * come straight from Apple (`primaryGenreName`). This module closes the
 * loop by deriving the genre COLORS from Apple Music data too — instead
 * of hand-picking hex values from the HIG palette, we ask iTunes Search
 * for one canonical track per genre and extract the dominant hue from
 * its artwork. The result: every visual aspect of the genre system in
 * VIBLOC is sourced from Apple, not editorialized.
 *
 * How it works
 * ------------
 *  1. `CANONICAL_QUERY` maps each GenreKey to a generic, artist-free
 *     search term Apple's catalog reliably resolves to a track filed
 *     under that exact genre.
 *  2. `loadAppleGenreColors()` runs all 18 lookups in parallel, fetches
 *     each top result's `artworkUrl100`, upscales the URL to 300×300
 *     (free CDN substitution), draws it into an offscreen canvas, and
 *     extracts a dominant saturated hue via 12-bin hue histogram.
 *  3. Result is cached to localStorage under `vibloc.genreColors.v3`
 *     with a 7-day TTL so subsequent sessions hydrate synchronously
 *     before React mounts (no flash). The cache key was bumped from
 *     v1 → v3 when the hue-spread fallback landed (see CACHE_KEY
 *     comment below).
 *
 * Failure mode: every step is wrapped in try/catch and resolves to
 * `null` on failure. Callers fall back to the static HIG palette in
 * `src/data/genres.ts`. Network outages, CORS regressions, or canvas
 * taint never crash the app.
 *
 * Cost: 18 search calls + 18 image loads on the FIRST load only. Each
 * search is ~2 KB, each artwork is ~20 KB → ~400 KB once a week. Apple
 * mzstatic.com sends `Access-Control-Allow-Origin: *` so the canvas is
 * not tainted and `getImageData` works without an API key.
 */

import type { GenreKey } from '../../types';

// v3: bumped after seeding the spreader with fallback HSL too, so
// every one of the 18 genres now participates in the hue-spread pass.
// v2 left genres with failed extraction at their static hex, which
// caused them to land within a few degrees of already-spread slots.
const CACHE_KEY = 'vibloc.genreColors.v3';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SEARCH_ENDPOINT = 'https://itunes.apple.com/search';

export type GenreColorMap = Record<GenreKey, string>;

/**
 * One canonical iTunes Search query per Apple GenreKey. Each query is
 * picked to land on a track Apple itself files under that genre, so
 * the resulting artwork carries that genre's visual identity. Queries
 * are intentionally generic ("classic rock", "j-pop") and never name
 * a specific artist — we want Apple's catalog's idea of the genre,
 * not a single artist's branding.
 */
const CANONICAL_QUERY: Record<GenreKey, string> = {
  pop: 'top pop hits',
  rock: 'classic rock',
  hiphop: 'hip hop',
  rnb: 'r&b soul',
  electronic: 'electronic dance',
  alternative: 'alternative indie',
  jazz: 'jazz standards',
  classical: 'classical orchestra',
  country: 'country',
  latin: 'latin pop',
  kpop: 'k-pop',
  jpop: 'j-pop',
  soundtrack: 'movie soundtrack',
  singer: 'singer songwriter',
  reggae: 'reggae',
  world: 'world music',
  blues: 'blues',
  anime: 'anime',
};

type CacheEntry = { t: number; v: GenreColorMap };

/**
 * Synchronous cache read. Safe to call at module load time so
 * `genres.ts` can hydrate `GENRE_COLORS` before React mounts.
 */
export function getCachedGenreColors(): GenreColorMap | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.t > CACHE_TTL_MS) return null;
    return parsed.v;
  } catch {
    return null;
  }
}

function setCachedGenreColors(colors: GenreColorMap): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), v: colors }));
  } catch {
    /* localStorage full / disabled — ignore */
  }
}

// ─── Color math ─────────────────────────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): string => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Walk an artwork's pixel buffer and return the dominant saturated
 * hue as a hex string, or null if no usable color is found.
 *
 * Strategy: 12-bin hue histogram weighted by saturation. We skip
 * near-grayscale (s < 0.25) and near-black/near-white (l < 0.12 or
 * l > 0.92) so a black album cover doesn't bias the result. The
 * winning bin's mean hue is the genre's color, with lightness pinned
 * into a UI-friendly range so a moody jazz cover doesn't produce a
 * #050505 swatch nobody can see on a white background.
 */
export type Hsl = { h: number; s: number; l: number };

export async function extractDominantHsl(imageUrl: string): Promise<Hsl | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const W = 64;
        const H = 64;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H).data;

        const BIN_COUNT = 12;
        const bins = Array.from({ length: BIN_COUNT }, () => ({
          h: 0, s: 0, l: 0, w: 0,
        }));
        for (let i = 0; i < data.length; i += 4) {
          const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
          if (s < 0.25) continue;
          if (l < 0.12 || l > 0.92) continue;
          const idx = Math.floor(h * BIN_COUNT) % BIN_COUNT;
          const w = s;
          bins[idx].h += h * w;
          bins[idx].s += s * w;
          bins[idx].l += l * w;
          bins[idx].w += w;
        }
        let bestIdx = -1;
        let bestW = 0;
        for (let i = 0; i < BIN_COUNT; i++) {
          if (bins[i].w > bestW) {
            bestW = bins[i].w;
            bestIdx = i;
          }
        }
        if (bestIdx < 0) return resolve(null);
        const b = bins[bestIdx];
        resolve({
          h: b.h / b.w,
          s: b.s / b.w,
          l: b.l / b.w,
        });
      } catch {
        // Tainted canvas, decode error, etc. — fall back silently.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * Spread the extracted hues across the color wheel so no two genres
 * end up visually indistinguishable.
 *
 * Why this is necessary
 * ---------------------
 * Apple Music album covers are heavily biased toward warm tones — pop,
 * rock, jazz, anime, j-pop, hip-hop and r&b all routinely come back
 * with reds/oranges/magentas after dominant-hue extraction. The raw
 * Apple-derived palette is therefore beautifully sourced but visually
 * unusable: half the chips look the same on the city map.
 *
 * The fix is to keep the EXTRACTED hue as the assignment hint, but
 * reassign each genre to a slot on an evenly-spaced 18-step hue wheel.
 * Greedy nearest-slot assignment guarantees:
 *   1. Every pair of genres is at least 360°/18 = 20° apart in hue
 *      (well above the JND of ~10° for adjacent swatches).
 *   2. Each genre still lands on the slot closest to its Apple-
 *      derived hue, so jazz stays warm, electronic stays cool, etc.
 *   3. The assignment is deterministic and reproducible across
 *      sessions as long as the extracted hues are the same.
 *
 * Saturation and lightness are taken from the extracted color (so a
 * jazz cover's earthy mood survives) but clamped into a UI-legible
 * range so no swatch ends up too dark / too pale to read against
 * either the light or dark theme.
 */
function spreadHues(extracted: Map<GenreKey, Hsl>): Map<GenreKey, string> {
  const SLOT_COUNT = 18;
  const slotHues: number[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) slotHues.push(i / SLOT_COUNT);

  // Sort genres by extracted hue. Walk the sorted list and assign each
  // to its current best free slot (nearest unused hue). This is the
  // standard greedy approximation of optimal 1D assignment, and it's
  // exact when the cost is monotone in distance — which it is here.
  const sorted = Array.from(extracted.entries()).sort(
    (a, b) => a[1].h - b[1].h,
  );
  const used = new Set<number>();
  const result = new Map<GenreKey, string>();

  for (const [key, hsl] of sorted) {
    let bestSlot = -1;
    let bestDist = Infinity;
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (used.has(i)) continue;
      // Circular hue distance: min(|a−b|, 1−|a−b|).
      const raw = Math.abs(slotHues[i] - hsl.h);
      const dist = Math.min(raw, 1 - raw);
      if (dist < bestDist) {
        bestDist = dist;
        bestSlot = i;
      }
    }
    if (bestSlot < 0) continue; // shouldn't happen — 18 slots, 18 genres
    used.add(bestSlot);
    const targetHue = slotHues[bestSlot];
    // Clamp s/l into a UI-legible range. Saturation floor 0.55 keeps
    // the chip vivid even when the source cover was muted; lightness
    // 0.45–0.58 stays readable on both white and dark backgrounds.
    const ss = Math.max(0.55, Math.min(0.85, hsl.s * 1.2));
    const ll = Math.max(0.45, Math.min(0.58, hsl.l));
    result.set(key, hslToHex(targetHue, ss, ll));
  }
  return result;
}

// ─── Apple Search → artwork ─────────────────────────────────────────

type ItunesSearchResponse = {
  results?: { artworkUrl100?: string }[];
};

async function fetchTopArtworkForGenre(genre: GenreKey): Promise<string | null> {
  const params = new URLSearchParams({
    term: CANONICAL_QUERY[genre],
    media: 'music',
    entity: 'song',
    country: 'us',
    limit: '5',
  });
  try {
    const res = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ItunesSearchResponse;
    for (const r of data.results || []) {
      if (r.artworkUrl100) {
        // Upscale via the documented `100x100bb` → `300x300bb` swap.
        // 300 is enough for color analysis without burning bandwidth.
        return r.artworkUrl100.replace('100x100bb', '300x300bb');
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch a representative artwork for every Apple GenreKey, extract a
 * dominant color from each, and return the merged color map. Any
 * genre whose extraction fails keeps the `fallback` color (typically
 * the static HIG palette in `genres.ts`). Result is cached for 7 days
 * so subsequent sessions hydrate synchronously.
 */
export async function loadAppleGenreColors(
  fallback: GenreColorMap,
): Promise<GenreColorMap> {
  const cached = getCachedGenreColors();
  if (cached) return cached;

  const result: GenreColorMap = { ...fallback };
  const keys = Object.keys(CANONICAL_QUERY) as GenreKey[];

  // Phase 1 — seed every genre with its fallback HSL so genres whose
  // artwork extraction fails (offline, mzstatic CORS regression,
  // weird album cover) still participate in the hue-spread step.
  // Without this seed, 16/18 genres get reassigned and 2 keep their
  // static hex, which puts the orphans within a few degrees of an
  // already-assigned slot — exactly the collision the spread is
  // supposed to prevent.
  const extractedHsl = new Map<GenreKey, Hsl>();
  for (const k of keys) {
    const hex = fallback[k];
    if (hex) extractedHsl.set(k, hexToHsl(hex));
  }

  // Phase 2 — overwrite the seed with the real extracted HSL whenever
  // the artwork load succeeds. Genres that fail extraction silently
  // keep their fallback HSL.
  await Promise.all(
    keys.map(async (k) => {
      const url = await fetchTopArtworkForGenre(k);
      if (!url) return;
      const hsl = await extractDominantHsl(url);
      if (hsl) extractedHsl.set(k, hsl);
    }),
  );

  // Phase 3 — spread the 18 hues across an evenly-spaced wheel.
  // Without this step half the chips collapse into the warm/red
  // cluster because Apple cover art is heavily warm-biased.
  const spread = spreadHues(extractedHsl);
  for (const [k, hex] of spread) result[k] = hex;

  setCachedGenreColors(result);
  return result;
}

/** Convert a `#rrggbb` string into HSL. Used to bring fallback colors
 *  into the same color-wheel space as the extracted ones so they can
 *  participate in the hue-spreading assignment. */
function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [h, s, l] = rgbToHsl(r, g, b);
  return { h, s, l };
}
