import type { GenreKey, GenreColor } from '../types';
import { getCachedGenreColors } from '../lib/music/genreColorSource';

/**
 * Color palette for the 18 Apple Music top-level genre buckets.
 *
 * Source of truth (two layers, in priority order):
 *   1. **Apple Music artwork** — at app start, `loadAppleGenreColors()`
 *      in `lib/music/genreColorSource.ts` queries iTunes Search for one
 *      canonical track per genre, downloads the artwork, and extracts
 *      the dominant saturated hue via a 12-bin hue histogram. The
 *      result is cached to localStorage and read back synchronously
 *      here at module load. After the first session every color is
 *      derived from real Apple Music data.
 *   2. **HIG fallback** — the hand-picked HIG palette below is used on
 *      the very first load, when the cache is cold, when the user is
 *      offline, or when artwork extraction fails for a specific genre.
 *      Colors are picked from the Apple HIG system palette so even the
 *      fallback stays visually coherent with Apple Music's own UI.
 *
 * Labels (`label`) and `feel` strings are NOT derived from Apple — the
 * label is the canonical Apple `primaryGenreName` string, and `feel` is
 * a short editorial summary used by the UI. The COLOR is the only
 * field that benefits from artwork extraction.
 */
const STATIC_GENRE_COLORS: Record<GenreKey, GenreColor> = {
  pop:         { name: 'pop',         color: '#ff2d55', label: 'Pop',                feel: 'Bold, energetic' },
  rock:        { name: 'rock',        color: '#ff453a', label: 'Rock',               feel: 'Raw, driving' },
  hiphop:      { name: 'hiphop',      color: '#5856d6', label: 'Hip-Hop/Rap',        feel: 'Urban, beat-driven' },
  rnb:         { name: 'rnb',         color: '#af52de', label: 'R&B/Soul',           feel: 'Deep, nocturnal' },
  electronic:  { name: 'electronic',  color: '#00c7be', label: 'Dance / Electronic', feel: 'Cold, kinetic' },
  alternative: { name: 'alternative', color: '#34c759', label: 'Alternative',        feel: 'Independent, edgy' },
  jazz:        { name: 'jazz',        color: '#ff9500', label: 'Jazz',               feel: 'Warm, analog' },
  classical:   { name: 'classical',   color: '#ffcc00', label: 'Classical',          feel: 'Refined, golden' },
  country:     { name: 'country',     color: '#a2845e', label: 'Country',            feel: 'Rural, storytelling' },
  latin:       { name: 'latin',       color: '#ff6b35', label: 'Latin',              feel: 'Tropical, rhythmic' },
  kpop:        { name: 'kpop',        color: '#ff66a3', label: 'K-Pop',              feel: 'Glossy, synchronized' },
  jpop:        { name: 'jpop',        color: '#ffa3d9', label: 'J-Pop',              feel: 'Bright, melodic' },
  soundtrack:  { name: 'soundtrack',  color: '#8e8e93', label: 'Soundtrack',         feel: 'Cinematic, swelling' },
  singer:      { name: 'singer',      color: '#7eb3a3', label: 'Singer/Songwriter',  feel: 'Intimate, acoustic' },
  reggae:      { name: 'reggae',      color: '#46b35e', label: 'Reggae',             feel: 'Laid-back, sunny' },
  world:       { name: 'world',       color: '#5ac8fa', label: 'World',              feel: 'Global, traditional' },
  blues:       { name: 'blues',       color: '#1e6fe6', label: 'Blues',              feel: 'Soulful, melancholy' },
  anime:       { name: 'anime',       color: '#ff5a8f', label: 'Anime',              feel: 'Vivid, dramatic' },
};

/**
 * Hydrate the static palette with cached Apple-derived colors when
 * available. This runs once at module load, before any component
 * renders, so consumers see Apple-sourced colors from the first paint
 * (after the initial extraction has populated the cache).
 *
 * The result is exported as `GENRE_COLORS` and is intentionally
 * mutable in shape (callers may reassign by key) but treated as
 * immutable by all current consumers.
 */
function hydrateFromAppleCache(): Record<GenreKey, GenreColor> {
  const cached = getCachedGenreColors();
  if (!cached) {
    return { ...STATIC_GENRE_COLORS };
  }
  const out = {} as Record<GenreKey, GenreColor>;
  for (const k of Object.keys(STATIC_GENRE_COLORS) as GenreKey[]) {
    const base = STATIC_GENRE_COLORS[k];
    out[k] = { ...base, color: cached[k] || base.color };
  }
  return out;
}

export const GENRE_COLORS: Record<GenreKey, GenreColor> = hydrateFromAppleCache();

/**
 * Re-export the static palette so the Apple loader can use it as the
 * `fallback` argument when extraction fails for a specific genre.
 */
export { STATIC_GENRE_COLORS };

export const VIBE_TAGS = [
  'Chill', 'Trendy', 'Ethereal', 'Rainy-day',
  'Hidden gem', 'Energetic', 'Dramatic', 'Flow',
] as const;
