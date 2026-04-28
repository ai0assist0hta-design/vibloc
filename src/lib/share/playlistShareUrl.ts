/**
 * Playlist share-url encoder / decoder.
 *
 * Pattern: data-in-fragment + LZString compression (Excalidraw style).
 * The full payload lives inside the URL hash so it never touches a
 * server log or referrer header. No backend required.
 *
 *   {v:1, b:buildingId, t:taggerId, n:name, tracks:[{i,n,a,art,p,g}…]}
 *      │
 *      ▼ JSON.stringify
 *      ▼ LZString.compressToEncodedURIComponent
 *      ▼
 *   https://vibloc.app/p#d=<compressed>
 *
 * Capacity:
 *   QR ECL-H @ alphanumeric ≈ 1.2 KB     (safe for 8–10 tracks)
 *   QR ECL-M @ alphanumeric ≈ 2.3 KB     (safe for 15–20 tracks)
 *   We bias toward ECL-H so the code reads even when half-covered.
 *
 * Receiver-side:
 *   - on app boot, check `location.hash` for `#p=…` → decode → render
 *     a READ-ONLY preview. Never auto-write to localStorage; require
 *     an explicit "Import" CTA from the user.
 */

import LZString from 'lz-string';
import type { PinnedTrack } from '../music/buildingPlaylist';

/** Trimmed track shape — single-letter keys cut ~40% off the payload. */
export type SharedTrack = {
  i: string; // id (= iTunes trackId)
  n: string; // trackName
  a: string; // artistName
  art?: string; // artworkUrl
  p?: string; // previewUrl
  u?: string; // trackViewUrl (canonical Apple Music link from iTunes Search API)
  g: string; // genre key
};

/** Best-effort canonical Apple Music URL for a shared track.
 *
 *  Prefers the iTunes-API-supplied `trackViewUrl` (correct slug,
 *  storefront, album-anchored), falls back to the universal short
 *  form `music.apple.com/song/{trackId}` which Apple has supported
 *  since 2022 and resolves to the right region automatically. */
export function appleMusicUrl(t: { i: string; u?: string }): string {
  if (t.u) return t.u;
  return `https://music.apple.com/song/${encodeURIComponent(t.i)}`;
}

export type SharedPlaylist = {
  v: 1;        // schema version
  b: string;   // buildingId
  t: string;   // taggerId
  n: string;   // playlist name (custom or curator's display name)
  tn: string;  // taggerName (display)
  tracks: SharedTrack[];
};

const HASH_KEY = 'p';

/** Pack a playlist into the share URL fragment. Returns the full URL
 *  ready for QR encoding. Throws if the resulting URL exceeds the
 *  caller-supplied byte cap (default 2400, safely below QR ECL-H
 *  alphanumeric capacity at version 30). */
export function encodePlaylistUrl(
  base: string,
  playlist: SharedPlaylist,
  maxBytes = 2400,
): string {
  const json = JSON.stringify(playlist);
  const compressed = LZString.compressToEncodedURIComponent(json);
  const url = `${base.replace(/\/$/, '')}/p#${HASH_KEY}=${compressed}`;
  if (url.length > maxBytes) {
    throw new Error(
      `Playlist too large for QR (${url.length} > ${maxBytes} bytes). ` +
      `Try sharing a smaller subset or use Copy Link only.`,
    );
  }
  return url;
}

/** Inverse: read `location.hash` (or any string) and return the
 *  decoded playlist, or null if the hash isn't a share URL. */
export function decodePlaylistFromHash(hash: string): SharedPlaylist | null {
  if (!hash) return null;
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(cleaned);
  const compressed = params.get(HASH_KEY);
  if (!compressed) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(compressed);
    if (!json) return null;
    const parsed = JSON.parse(json) as unknown;
    if (!isSharedPlaylist(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Convert PinnedTrack[] → SharedTrack[] (drop fields irrelevant to
 *  the receiver, shorten keys). */
export function toSharedTracks(tracks: PinnedTrack[]): SharedTrack[] {
  return tracks.map((t) => ({
    i: t.id,
    n: t.trackName,
    a: t.artistName,
    art: t.artworkUrl || undefined,
    p: t.previewUrl || undefined,
    u: t.trackViewUrl || undefined,
    g: t.genre,
  }));
}

/** Type guard. Strict enough that random JSON dropped into the hash
 *  doesn't render as a "playlist". */
function isSharedPlaylist(x: unknown): x is SharedPlaylist {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.v !== 1) return false;
  if (typeof o.b !== 'string') return false;
  if (typeof o.t !== 'string') return false;
  if (typeof o.n !== 'string') return false;
  if (typeof o.tn !== 'string') return false;
  if (!Array.isArray(o.tracks)) return false;
  for (const t of o.tracks) {
    if (!t || typeof t !== 'object') return false;
    const tt = t as Record<string, unknown>;
    if (typeof tt.i !== 'string') return false;
    if (typeof tt.n !== 'string') return false;
    if (typeof tt.a !== 'string') return false;
    if (typeof tt.g !== 'string') return false;
  }
  return true;
}
