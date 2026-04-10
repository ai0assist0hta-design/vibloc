/**
 * Shared track types for the music recommendation layer.
 *
 * Why this file exists
 * --------------------
 * Every music source we touch (iTunes Search, iTunes RSS Top Songs)
 * eventually gets normalized into ONE shape so the UI never has to
 * branch on "where did this track come from". CLAUDE.md §5 already
 * picked iTunes as the canonical source — these types mirror the
 * fields the existing `Tag` schema in `src/types/index.ts` already has
 * (`trackName`, `artistName`, `artworkUrl`, `previewUrl`), so the
 * RecommendedTrack → Tag conversion is a 1:1 spread when a user pins.
 */

import type { GenreKey } from '../../types';

export type RecommendedTrack = {
  /** iTunes trackId (or RSS feed item id) — used as React key + dedupe. */
  id: string;
  trackName: string;
  artistName: string;
  /** Album art URL — already a hot-linkable Apple CDN URL. */
  artworkUrl: string;
  /** 30s m4a preview. May be empty if iTunes didn't return one. */
  previewUrl: string;
  /** Apple's raw genre label, e.g. "K-Pop", "Alternative". */
  primaryGenreName: string;
  /** Normalized into our 7-group GenreKey palette (CLAUDE.md §6). */
  genre: GenreKey;
  /** Apple Music page — kept for the future "open in Apple Music" deep link.
   *  We do NOT render this as an external button (Walled Garden, CLAUDE.md §11). */
  trackViewUrl: string;
};

export type CityVibe = {
  /** Display label, e.g. "Shinjuku" / "Manhattan". */
  city: string;
  /** Country code used for the iTunes store query (ISO 3166-1 alpha-2). */
  country: 'JP' | 'KR' | 'US';
  /** Genre keys for this city, ordered by dominance — used both as the
   *  City Vibe label (top 3 shown as chips) and as the recommendation
   *  filter (the engine scores RSS picks against this whole list, not
   *  just the top 3, so the long-tail still pulls some signal). */
  topGenres: GenreKey[];
  /** Free-text mood / scene / ethnic-cuisine keywords used as extra
   *  iTunes search seeds. These broaden the local pool beyond the RSS
   *  Top Songs feed so neighborhoods with distinctive ethnic/cultural
   *  identity (Manhattan's Harlem jazz, LA's Koreatown, Itaewon's
   *  multicultural late-night scene, etc.) actually surface music
   *  from those scenes — not just whatever is on the country chart. */
  moodKeywords: string[];
};
