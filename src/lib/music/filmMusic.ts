/**
 * Film / MV / landmark → playable iTunes track resolver.
 *
 * Three small entry points, all backed by `searchTrack`:
 *
 *   • `titleSongForFilm`     — for buildings tagged as a film filming
 *                              location: returns ONE track (the title
 *                              song / main theme) so the rest of the
 *                              recommendation list can stay local-music.
 *   • `trackForMusicVideo`   — for MV filming locations: returns the
 *                              MV's own song (Wikidata MV labels are
 *                              the song title, so a direct title search
 *                              lands on the right iTunes entry).
 *   • `songsNamedAfterLandmark` — for buildings with a real proper
 *                              name: returns iTunes tracks whose title
 *                              literally contains the landmark name.
 */

import { searchTrack, type CountryCode } from './itunes';
import type { RecommendedTrack } from './trackTypes';

/**
 * Resolve a film to its **title song** (a single track).
 *
 * For films featured at a building we deliberately surface only one
 * track — the title/main theme — instead of the full OST. The user
 * wants the recommendation to be "the song *of* this film", not the
 * 30-cue album, so the rest of the playlist can stay local-music.
 *
 * Heuristic, in order of preference:
 *   1. Search `${title} theme` → first OST/Score-tagged hit whose
 *      track name literally contains the film title (e.g.
 *      "King Kong Theme", "Main Theme from Lost in Translation").
 *   2. Same search → first hit whose track name contains the film
 *      title at all (covers films whose theme isn't OST-tagged).
 *   3. Fallback to the first OST/Score-tagged hit at all.
 *
 * Returns `[]` only if iTunes has nothing playable.
 */
export async function titleSongForFilm(
  filmTitle: string,
  country: CountryCode,
  signal?: AbortSignal,
): Promise<RecommendedTrack[]> {
  const clean = filmTitle.trim();
  if (!clean) return [];

  const wide = await searchTrack(`${clean} theme`, country, 15, signal);
  const wantLower = clean.toLowerCase();
  const isOst = (t: RecommendedTrack): boolean => {
    const g = (t.primaryGenreName || '').toLowerCase();
    return g.includes('soundtrack') || g.includes('score');
  };

  const ostTitleMatch = wide.find(
    (t) => t.previewUrl && isOst(t) && t.trackName.toLowerCase().includes(wantLower),
  );
  if (ostTitleMatch) return [ostTitleMatch];

  const anyTitleMatch = wide.find(
    (t) => t.previewUrl && t.trackName.toLowerCase().includes(wantLower),
  );
  if (anyTitleMatch) return [anyTitleMatch];

  const anyOst = wide.find((t) => t.previewUrl && isOst(t));
  return anyOst ? [anyOst] : [];
}

/**
 * Resolve a music video's audio track. Wikidata's MV entries have
 * the song title as their label, so a direct title search usually
 * lands on the right iTunes entry.
 */
export async function trackForMusicVideo(
  songTitle: string,
  country: CountryCode,
  limit = 5,
  signal?: AbortSignal,
): Promise<RecommendedTrack[]> {
  if (!songTitle.trim()) return [];
  const hits = await searchTrack(songTitle, country, 10, signal);
  const seen = new Set<string>();
  const out: RecommendedTrack[] = [];
  for (const t of hits) {
    if (!t.previewUrl) continue;
    const k = `${t.trackName.toLowerCase()}|${t.artistName.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Search iTunes for tracks whose name literally contains the
 * landmark name — used for famous proper-noun buildings (Empire
 * State, Tokyo Tower, etc.) where "songs about this place" is a
 * legitimate algorithm.
 *
 * We require the landmark name to appear in the trackName itself
 * (case-insensitive) rather than just being a search hit, since
 * iTunes Search will fuzzy-match anything close.
 */
export async function songsNamedAfterLandmark(
  landmarkName: string,
  country: CountryCode,
  limit = 5,
  signal?: AbortSignal,
): Promise<RecommendedTrack[]> {
  const clean = landmarkName.trim();
  if (!clean) return [];
  const hits = await searchTrack(`"${clean}"`, country, 25, signal);
  const wantLower = clean.toLowerCase();
  const matched = hits.filter(
    (t) => t.previewUrl && t.trackName.toLowerCase().includes(wantLower),
  );
  // Dedupe by track name to avoid the same song from 5 different
  // compilation albums dominating the list.
  const seen = new Set<string>();
  const out: RecommendedTrack[] = [];
  for (const t of matched) {
    const k = t.trackName.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}
