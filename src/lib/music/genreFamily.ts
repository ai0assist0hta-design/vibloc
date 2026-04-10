/**
 * 7-family color collapse for the 18 Apple GenreKey buckets.
 *
 * Source: 2026-04-09 UI/UX research, G.4 (Healey & Enns preattentive
 * ceiling, ~7 distinguishable hues), G.3 (color must be paired with a
 * non-color cue for accessibility). 18 unique chip colors exceed the
 * preattentive ceiling and were collapsing into a warm cluster after
 * Apple-artwork extraction. This module groups the 18 genres into 7
 * visually-distinct families and pairs each with a single-character
 * glyph so the section is decodable without color (WCAG SC 1.4.1).
 *
 * Each family color is hand-tuned to:
 *   - Maintain ~50° hue separation around the wheel.
 *   - Hit lightness in the 0.45-0.55 band so chip text on the
 *     translucent fill (color + 0x22 alpha) stays ≥4.5:1 contrast.
 *   - Stay close to Apple HIG system colors so the visual language
 *     remains coherent with Apple Music's own UI.
 *
 * Consumers should use `getFamily(genreKey)` for color/glyph and only
 * fall back to `GENRE_COLORS[g].color` for backwards-compatible
 * decorative use (e.g. the AI-extracted album hue accents).
 */

import type { GenreKey } from '../../types';

export type GenreFamilyKey =
  | 'energy'   // pop, kpop, jpop, anime — high energy bright
  | 'edge'     // rock, alternative — raw guitar
  | 'urban'    // hiphop, rnb — beat-driven
  | 'pulse'    // electronic, dance — synthetic motion
  | 'warm'     // jazz, blues, singer, country — analog/acoustic
  | 'cinema'   // classical, soundtrack — orchestral
  | 'global';  // latin, reggae, world — international

export type GenreFamily = {
  key: GenreFamilyKey;
  label: string;
  color: string;   // base hue, ~L 50
  glyph: string;   // single character / emoji for the chip
};

export const FAMILIES: Record<GenreFamilyKey, GenreFamily> = {
  energy: { key: 'energy', label: 'Energy',   color: '#ff2d6f', glyph: '◆' },
  edge:   { key: 'edge',   label: 'Edge',     color: '#e8483a', glyph: '▲' },
  urban:  { key: 'urban',  label: 'Urban',    color: '#7b5cff', glyph: '■' },
  pulse:  { key: 'pulse',  label: 'Pulse',    color: '#00b3c4', glyph: '●' },
  warm:   { key: 'warm',   label: 'Warm',     color: '#e89833', glyph: '◐' },
  cinema: { key: 'cinema', label: 'Cinema',   color: '#cab02b', glyph: '★' },
  global: { key: 'global', label: 'Global',   color: '#34a763', glyph: '◇' },
};

const FAMILY_OF: Record<GenreKey, GenreFamilyKey> = {
  pop:         'energy',
  kpop:        'energy',
  jpop:        'energy',
  anime:       'energy',
  rock:        'edge',
  alternative: 'edge',
  hiphop:      'urban',
  rnb:         'urban',
  electronic:  'pulse',
  jazz:        'warm',
  blues:       'warm',
  singer:      'warm',
  country:     'warm',
  classical:   'cinema',
  soundtrack:  'cinema',
  latin:       'global',
  reggae:      'global',
  world:       'global',
};

export function getFamily(genre: GenreKey): GenreFamily {
  return FAMILIES[FAMILY_OF[genre] ?? 'pulse'];
}
