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
// Palette redesigned 2026-05-04 after research review (Palmer/Schloss
// "Bach to the Blues", color-meanings cross-cultural study, ColorBrewer
// CVD guidelines). Goals: (1) honor cultural conventions where they
// converge — jazz/blues = blue, classical = golden, reggae = rasta
// green, etc. (2) spread hues so adjacent chips stay distinguishable —
// the previous palette had 5 pinks/reds clustered (pop/kpop/jpop/anime
// /latin) that collapsed under glance; (3) keep WCAG ≥4.5:1 on the
// translucent +0x22 chip background. Specific moves:
//   • jazz orange → deep blue ("blue note" convention)
//   • anime light pink → magenta-violet (separate from K-pop)
//   • jpop pastel pink → peach (separate from K-pop / pop)
//   • world sky blue → amber (resolve blue collision with blues)
//   • singer sage → mauve (resolve neutral collision with soundtrack)
//   • alternative apple-green → acid lime (separate from reggae)
//   • blues → cobalt (sit between jazz navy and hip-hop indigo)
//   • rock → crimson (deepen vs pop hot pink)
const STATIC_GENRE_COLORS: Record<GenreKey, GenreColor> = {
  pop:         { name: 'pop',         color: '#ff2d55', label: 'Pop',                feel: 'Bold, energetic' },
  rock:        { name: 'rock',        color: '#dc1432', label: 'Rock',               feel: 'Raw, driving' },
  hiphop:      { name: 'hiphop',      color: '#5856d6', label: 'Hip-Hop/Rap',        feel: 'Urban, beat-driven' },
  rnb:         { name: 'rnb',         color: '#af52de', label: 'R&B/Soul',           feel: 'Deep, nocturnal' },
  electronic:  { name: 'electronic',  color: '#00c7be', label: 'Dance / Electronic', feel: 'Cold, kinetic' },
  alternative: { name: 'alternative', color: '#9bc53d', label: 'Alternative',        feel: 'Independent, edgy' },
  jazz:        { name: 'jazz',        color: '#1f4d8b', label: 'Jazz',               feel: 'Warm, analog' },
  classical:   { name: 'classical',   color: '#ffcc00', label: 'Classical',          feel: 'Refined, golden' },
  country:     { name: 'country',     color: '#a2845e', label: 'Country',            feel: 'Rural, storytelling' },
  latin:       { name: 'latin',       color: '#ff6b35', label: 'Latin',              feel: 'Tropical, rhythmic' },
  kpop:        { name: 'kpop',        color: '#ff66a3', label: 'K-Pop',              feel: 'Glossy, synchronized' },
  jpop:        { name: 'jpop',        color: '#ffb38a', label: 'J-Pop',              feel: 'Bright, melodic' },
  soundtrack:  { name: 'soundtrack',  color: '#8e8e93', label: 'Soundtrack',         feel: 'Cinematic, swelling' },
  singer:      { name: 'singer',      color: '#c19ec0', label: 'Singer/Songwriter',  feel: 'Intimate, acoustic' },
  reggae:      { name: 'reggae',      color: '#46b35e', label: 'Reggae',             feel: 'Laid-back, sunny' },
  world:       { name: 'world',       color: '#f5a623', label: 'World',              feel: 'Global, traditional' },
  blues:       { name: 'blues',       color: '#3a8dff', label: 'Blues',              feel: 'Soulful, melancholy' },
  anime:       { name: 'anime',       color: '#d65aff', label: 'Anime',              feel: 'Vivid, dramatic' },
};

/**
 * Source of truth for genre colors.
 *
 * As of 2026-05-04 we DELIBERATELY ignore the Apple-extracted cache
 * and ship the curated static palette. Rationale:
 *   - The album-art hue extractor produced visually clustered
 *     warm/orange tones (most jazz/blues/classical covers happen to
 *     be warm-lit photography), which collapsed under glance and
 *     fought cultural conventions (jazz=blue, classical=gold).
 *   - The redesigned static palette honors Palmer/Schloss
 *     emotion-mediated mappings + crowd convention while
 *     guaranteeing perceptual separation across the 18 buckets.
 * `getCachedGenreColors` is kept as a no-op silent reference so
 * future opt-in (e.g. user toggle "use my Apple library hues") is a
 * one-line change.
 */
void getCachedGenreColors;
export const GENRE_COLORS: Record<GenreKey, GenreColor> = { ...STATIC_GENRE_COLORS };

// Expose the resolved palette on `window` so PreviewPlayer can read
// it WITHOUT importing this module (which would create a dependency
// cycle through the music/buildingPlaylist chain). The shape is
// intentionally minimal — just `{ [key]: { color } }` — so consumers
// don't tighten coupling beyond color lookup.
if (typeof window !== 'undefined') {
  (window as unknown as { __viblocGenreColors?: typeof GENRE_COLORS }).__viblocGenreColors = GENRE_COLORS;
}

/**
 * Re-export the static palette so the Apple loader can use it as the
 * `fallback` argument when extraction fails for a specific genre.
 */
export { STATIC_GENRE_COLORS };

export const VIBE_TAGS = [
  'Chill', 'Trendy', 'Ethereal', 'Rainy-day',
  'Hidden gem', 'Energetic', 'Dramatic', 'Flow',
] as const;
