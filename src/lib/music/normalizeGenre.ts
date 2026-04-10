/**
 * Normalize Apple's `primaryGenreName` into one of the GenreKey
 * values declared in `src/types/index.ts`.
 *
 * Source of truth: Apple Music's iTunes Genre Catalog (parent id 34
 * "Music"). Every GenreKey corresponds 1:1 with an Apple top-level
 * category — we do NOT invent buckets or merge categories that Apple
 * itself keeps separate. The only translation this function performs
 * is substring matching against the wide range of regional / dialect
 * spellings Apple ships in different country stores
 * (e.g. "Hip-Hop/Rap", "ヒップホップ／ラップ", "힙합/랩").
 *
 * Match priority
 * --------------
 * The matcher walks `GENRE_ALIASES` top-to-bottom and returns the
 * first token that appears in the lower-cased label. Order is load-
 * bearing because some Apple labels combine multiple categories
 * (e.g. "Hip-Hop/Soul" is filed under Hip-Hop on Apple's tree, not
 * Soul). More specific tokens MUST come before less specific ones.
 *
 * Unknown labels fall back to 'pop' — Apple's default broadcast
 * bucket — instead of an editorial guess like "indie".
 */

import type { GenreKey } from '../../types';

const GENRE_ALIASES: ReadonlyArray<readonly [string, GenreKey]> = [
  // ── Hip-Hop / Rap ── (must come before broader 'pop' / 'rnb')
  ['hip-hop', 'hiphop'],
  ['hip hop', 'hiphop'],
  ['hiphop', 'hiphop'],
  ['hip/hop', 'hiphop'],
  ['rap', 'hiphop'],
  ['trap', 'hiphop'],
  ['drill', 'hiphop'],
  ['boom bap', 'hiphop'],
  ['ヒップホップ', 'hiphop'],
  ['ラップ', 'hiphop'],
  ['랩', 'hiphop'],
  ['힙합', 'hiphop'],

  // ── K-Pop / J-Pop ── (must come before broader 'pop')
  ['k-pop', 'kpop'],
  ['kpop', 'kpop'],
  ['korean pop', 'kpop'],
  ['케이팝', 'kpop'],
  ['k팝', 'kpop'],
  ['j-pop', 'jpop'],
  ['jpop', 'jpop'],
  ['japanese pop', 'jpop'],
  ['j-ポップ', 'jpop'],
  ['ジェイポップ', 'jpop'],

  // ── Anime ──
  ['anime', 'anime'],
  ['アニメ', 'anime'],
  ['vocaloid', 'anime'],
  ['ボーカロイド', 'anime'],

  // ── R&B / Soul ── (Apple files Neo-Soul under R&B/Soul)
  ['r&b', 'rnb'],
  ['rnb', 'rnb'],
  ['r and b', 'rnb'],
  ['rhythm', 'rnb'],
  ['soul', 'rnb'],
  ['아르앤비', 'rnb'],
  ['알앤비', 'rnb'],

  // ── Soundtrack / Film score ──
  ['soundtrack', 'soundtrack'],
  ['ost', 'soundtrack'],
  ['score', 'soundtrack'],
  ['film music', 'soundtrack'],
  ['movie music', 'soundtrack'],
  ['musicals', 'soundtrack'],
  ['broadway', 'soundtrack'],
  ['サウンドトラック', 'soundtrack'],
  ['사운드트랙', 'soundtrack'],

  // ── Latin ──
  ['latin', 'latin'],
  ['salsa', 'latin'],
  ['reggaeton', 'latin'],
  ['bachata', 'latin'],
  ['merengue', 'latin'],
  ['cumbia', 'latin'],
  ['regional mexican', 'latin'],
  ['ranchera', 'latin'],
  ['banda', 'latin'],
  ['bossa', 'latin'],

  // ── Reggae ── (must come after 'reggaeton' which is Latin)
  ['reggae', 'reggae'],
  ['ska', 'reggae'],
  ['dancehall', 'reggae'],
  ['dub', 'reggae'],

  // ── Country ──
  ['country', 'country'],
  ['bluegrass', 'country'],
  ['americana', 'country'],

  // ── Singer/Songwriter ── (must come before broader matches)
  ['singer/songwriter', 'singer'],
  ['singer-songwriter', 'singer'],
  ['singer songwriter', 'singer'],
  ['folk', 'singer'],
  ['acoustic', 'singer'],
  ['シンガーソングライター', 'singer'],

  // ── Blues ──
  ['blues', 'blues'],
  ['delta blues', 'blues'],

  // ── Jazz ── (Apple keeps Jazz separate from R&B/Soul)
  ['jazz', 'jazz'],
  ['bebop', 'jazz'],
  ['swing', 'jazz'],
  ['lounge', 'jazz'],
  ['lo-fi', 'jazz'],
  ['lofi', 'jazz'],
  ['ジャズ', 'jazz'],
  ['재즈', 'jazz'],

  // ── Classical / Opera ──
  ['classical', 'classical'],
  ['orchestral', 'classical'],
  ['orchestra', 'classical'],
  ['opera', 'classical'],
  ['baroque', 'classical'],
  ['chamber', 'classical'],
  ['symphony', 'classical'],
  ['piano', 'classical'],
  ['クラシック', 'classical'],
  ['클래식', 'classical'],

  // ── Dance / Electronic ──
  ['electronic', 'electronic'],
  ['dance', 'electronic'],
  ['techno', 'electronic'],
  ['house', 'electronic'],
  ['edm', 'electronic'],
  ['ambient', 'electronic'],
  ['synthwave', 'electronic'],
  ['drum and bass', 'electronic'],
  ['dnb', 'electronic'],
  ['dubstep', 'electronic'],
  ['trance', 'electronic'],
  ['エレクトロニック', 'electronic'],
  ['일렉트로닉', 'electronic'],

  // ── Rock ── (Apple files Metal/Punk/Grunge under Rock)
  ['rock', 'rock'],
  ['metal', 'rock'],
  ['punk', 'rock'],
  ['hardcore', 'rock'],
  ['grunge', 'rock'],
  ['ロック', 'rock'],
  ['록', 'rock'],

  // ── Alternative / Indie ──
  ['alternative', 'alternative'],
  ['indie', 'alternative'],
  ['shoegaze', 'alternative'],
  ['post-rock', 'alternative'],
  ['post rock', 'alternative'],
  ['オルタナティブ', 'alternative'],

  // ── World (must come before 'pop' to catch labels like
  //         "World Pop"; Apple files most non-Western pop here.) ──
  ['world', 'world'],
  ['afrobeat', 'world'],
  ['celtic', 'world'],
  ['enka', 'world'],
  ['gamelan', 'world'],
  ['flamenco', 'world'],
  ['arabic', 'world'],
  ['mandopop', 'world'],
  ['cantopop', 'world'],
  ['chinese', 'world'],

  // ── Pop ── (broadest fallback before the unknown default)
  ['pop', 'pop'],
  ['vocal', 'pop'],
  ['easy listening', 'pop'],
  ['ポップ', 'pop'],
  ['팝', 'pop'],
];

export function normalizeGenre(raw: string): GenreKey {
  const lower = (raw || '').toLowerCase().trim();
  if (!lower) return 'pop';
  for (const [token, key] of GENRE_ALIASES) {
    if (lower.includes(token)) return key;
  }
  return 'pop';
}
