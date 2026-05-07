/**
 * Building playlist store — pinned tracks + optional description.
 *
 * Why this exists
 * ---------------
 * The recommendation engine produces a fresh mix each session, but
 * users want to *curate* their own per-building playlists with a
 * short note ("songs I'd play standing in front of this hotel at
 * 2am") that survives refreshes. This module is the persistence
 * layer behind that feature.
 *
 * Schema (v2)
 * -----------
 * Stored under `vibloc.playlists.v1` for storage continuity:
 *
 *   Record<buildingId, { tracks: PinnedTrack[], description: string }>
 *
 * v1 wrote a bare `PinnedTrack[]` for each building. The loader
 * transparently upgrades any legacy entry into `{ tracks, description }`
 * on read so existing pins survive the schema change without a
 * separate migration step. The localStorage key intentionally stays
 * `.v1` because the migration is idempotent and we don't want to
 * orphan early adopters' pinned tracks.
 *
 * Description rule
 * ----------------
 * The UI only surfaces the description input when `tracks.length >= 2`
 * (matches the user requirement: "한 곡짜리 플레이리스트엔 설명이
 * 의미가 없다"). The store itself doesn't enforce this — it just
 * stores whatever the caller passes — so the validation lives in
 * the component layer where it belongs.
 *
 * Subscriber pattern (mirrors PreviewPlayer.tsx) so multiple
 * components stay in sync without a global state lib.
 */

import { useEffect, useState } from 'react';
import type { RecommendedTrack } from './trackTypes';

export type PinnedTrack = RecommendedTrack & {
  /** Epoch ms — used to sort newest-first and as a tiebreaker. */
  pinnedAt: number;
  /** Who tagged this track. Stored at pin time from the auth store. */
  taggerName?: string;
  taggerId?: string;
  /** Tagger's profile picture URL (Instagram-style circular avatar). */
  taggerAvatarUrl?: string | null;
  /** Optional tagger-supplied custom playlist cover (full image
   *  override, used by the seeded "stock cover" personas). Stored on
   *  every pinned track from this tagger so getTopTaggers can lift
   *  it onto the TaggerGroup without an extra lookup table. */
  taggerCustomCoverUrl?: string | null;
  /** Like count for this pinned track. */
  likes?: number;
  /** Set of user IDs who liked this track (for toggle). */
  likedBy?: string[];
};

export type BuildingPlaylistEntry = {
  tracks: PinnedTrack[];
  /** Legacy / building-wide description (kept for back-compat with
   *  older localStorage payloads — UI no longer surfaces it). */
  description: string;
  /** DEPRECATED — kept on disk for back-compat, no longer rendered.
   *  The note feature was removed 2026-04-27. */
  taggerNotes?: Record<string, string>;
  /** Per-tagger custom playlist NAME — the only user-editable text on
   *  a playlist now. Appears on the TopTaggerCard rank rows and as
   *  the page title in PlaylistDetailView. Empty/missing = falls back
   *  to the curator's display name. */
  taggerPlaylistNames?: Record<string, string>;
  /** Per-tagger custom playlist COVER (data URL or remote URL). When
   *  set, overrides the seed `taggerCustomCoverUrl` and the 2×2 mosaic
   *  in PlaylistCover. Cleared by writing an empty string. */
  taggerPlaylistCovers?: Record<string, string>;
  /** Per-playlist (per-tagger) likes — userIds who liked the playlist
   *  itself (separate from per-track likes). Surfaces the heart pill
   *  on the TopTaggerCard rank rows. */
  playlistLikedBy?: Record<string, string[]>;
};

const STORAGE_KEY = 'vibloc.playlists.v1';

/** Product rule: a tagger's pinned tracks count as a "playlist"
 *  immediately — even one pin qualifies. Lowered from 3 to 1
 *  (2026-04-27) per UX review: the 3-track gate made every empty
 *  building's TOP PLAYLISTS read "No qualifying playlists yet —
 *  pin 3+ tracks", which scared off first-time users. The DRAFT
 *  badge below MIN is now also a no-op (always rendered the same
 *  as a normal playlist). Kept as an exported constant for the
 *  one or two consumers that still reference it. */
export const MIN_PLAYLIST_TRACKS = 1;

type Store = Record<string, BuildingPlaylistEntry>;
type Listener = (store: Store) => void;

let store: Store = loadFromStorage();
const listeners = new Set<Listener>();

function loadFromStorage(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    // Migrate v1 (PinnedTrack[]) → v2 ({tracks, description}).
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        out[k] = { tracks: v as PinnedTrack[], description: '' };
      } else if (v && typeof v === 'object' && 'tracks' in v) {
        const entry = v as BuildingPlaylistEntry;
        out[k] = {
          tracks: Array.isArray(entry.tracks) ? entry.tracks : [],
          description: typeof entry.description === 'string' ? entry.description : '',
          taggerNotes: entry.taggerNotes && typeof entry.taggerNotes === 'object'
            ? entry.taggerNotes
            : {},
          taggerPlaylistNames: entry.taggerPlaylistNames && typeof entry.taggerPlaylistNames === 'object'
            ? entry.taggerPlaylistNames
            : {},
          taggerPlaylistCovers: entry.taggerPlaylistCovers && typeof entry.taggerPlaylistCovers === 'object'
            ? entry.taggerPlaylistCovers
            : {},
          playlistLikedBy: entry.playlistLikedBy && typeof entry.playlistLikedBy === 'object'
            ? entry.playlistLikedBy
            : {},
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Subscribe to ANY playlist-store change (any building, any track,
 *  any like). Used by 3D scene decorations that need to know when to
 *  add/remove a rooftop DJ desk. Returns an unsubscribe function. */
export function subscribePlaylists(listener: () => void): () => void {
  const wrap: Listener = () => listener();
  listeners.add(wrap);
  return () => { listeners.delete(wrap); };
}

/** Re-read the store from localStorage and notify all subscribers.
 *  Used by the dev demo seeder which writes directly to localStorage
 *  before any UI mounts; without this, the in-memory snapshot taken
 *  at module load would mask the seeded data. */
export function reloadFromStorage(): void {
  store = loadFromStorage();
  notify();
}

/** Fold the shared-pins server cache into the in-memory store. For
 *  every buildingId that the server has at least one pin for, REPLACE
 *  the local entry's `tracks` with a deduped union of (server pins ∪
 *  local-only pins). Server is authoritative for any (track, tagger)
 *  pair that exists on both sides — local-only entries (offline pins
 *  pre-sign-in, dev-admin) are appended at the end so they don't
 *  disappear visually.
 *
 *  Pure (besides notifying subscribers): nothing is written back to
 *  localStorage — the server snapshot stays the live source of truth
 *  on each render and the localStorage cache continues to reflect
 *  whatever the local user has personally pinned. */
export function mergeSharedPinsIntoStore(
  remoteBuildings: readonly string[],
  getRemotePins: (buildingId: string) => readonly PinnedTrack[],
): void {
  if (remoteBuildings.length === 0) return;
  let touched = false;
  const next: Store = { ...store };
  for (const bid of remoteBuildings) {
    const remote = getRemotePins(bid);
    if (remote.length === 0) continue;
    const existing = store[bid];
    const localTracks = existing?.tracks ?? [];
    const seen = new Set<string>();
    const merged: PinnedTrack[] = [];
    for (const t of remote) {
      const key = `${t.id}|${t.taggerId ?? 'anonymous'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(t);
    }
    for (const t of localTracks) {
      const key = `${t.id}|${t.taggerId ?? 'anonymous'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(t);
    }
    if (merged.length === localTracks.length
        && merged.every((m, i) => m === localTracks[i])) continue;
    next[bid] = existing
      ? { ...existing, tracks: merged }
      : { tracks: merged, description: '' };
    touched = true;
  }
  if (touched) {
    store = next;
    notify();
  }
}

/** Fold the shared-likes server cache into the in-memory store —
 *  every track's `likedBy` becomes `local ∪ remote` and every entry's
 *  `playlistLikedBy` is merged the same way. Triggers `notify()` so
 *  every UI heart count updates without the consumer needing to know
 *  about Supabase. Called from main.tsx whenever the sharedLikes
 *  module hydrates, receives a Realtime push, or applies a local
 *  optimistic toggle. Server-authoritative — no localStorage write
 *  for the merged values (toggleLike still writes the local snapshot
 *  for the offline / dev-admin path). */
export function mergeSharedLikesIntoStore(
  getTrackLikers: (b: string, t: string) => ReadonlySet<string>,
  getPlaylistLikers: (b: string, t: string) => ReadonlySet<string>,
): void {
  let touched = false;
  const next: Store = {};
  for (const [bid, entry] of Object.entries(store)) {
    let trackTouched = false;
    const newTracks = entry.tracks.map((t) => {
      const remote = getTrackLikers(bid, t.id);
      if (remote.size === 0) return t;
      const merged = new Set([...(t.likedBy ?? []), ...remote]);
      if (merged.size === (t.likedBy?.length ?? 0)) return t;
      trackTouched = true;
      return { ...t, likedBy: [...merged], likes: merged.size };
    });
    let playlistMap = entry.playlistLikedBy;
    let plTouched = false;
    if (playlistMap) {
      const cloned: Record<string, string[]> = {};
      let any = false;
      for (const [tid, ids] of Object.entries(playlistMap)) {
        const remote = getPlaylistLikers(bid, tid);
        if (remote.size === 0) { cloned[tid] = ids; continue; }
        const merged = new Set([...(ids ?? []), ...remote]);
        if (merged.size === (ids?.length ?? 0)) { cloned[tid] = ids; continue; }
        cloned[tid] = [...merged];
        any = true;
      }
      if (any) { playlistMap = cloned; plTouched = true; }
    }
    if (trackTouched || plTouched) {
      touched = true;
      next[bid] = { ...entry, tracks: newTracks, playlistLikedBy: playlistMap };
    } else {
      next[bid] = entry;
    }
  }
  if (touched) {
    store = next;
    notify();
  }
}

function saveToStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / disabled — ignore, in-memory copy still works */
  }
}

function notify(): void {
  for (const l of listeners) l(store);
}

// Cross-tab live sync — when another tab writes to the same
// `vibloc.playlists.v1` key (e.g. user uploads a new playlist cover
// in tab A), the `storage` event fires here in tab B; we re-hydrate
// the in-memory snapshot and notify subscribers so the right rail's
// MY PLAYLIST card / RankRows / PlaylistDetailView all repaint with
// the freshly saved data without needing a manual refresh.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      store = loadFromStorage();
      notify();
    }
  });
}

function getEntry(buildingId: string): BuildingPlaylistEntry {
  return store[buildingId] ?? { tracks: [], description: '' };
}

/** Read the current pinned list for a building. Returns a fresh array
 *  sorted newest-first; safe to render directly. */
export function getPinned(buildingId: string): PinnedTrack[] {
  return getEntry(buildingId).tracks.slice().sort((a, b) => b.pinnedAt - a.pinnedAt);
}

export function getDescription(buildingId: string): string {
  return getEntry(buildingId).description;
}

/** Does the CURRENT user have this track pinned in this building?
 *  Scoped per-user so a track another curator already pinned doesn't
 *  block me from adding it to my own playlist (the schema stores one
 *  PinnedTrack row per (track, tagger) pair). */
export function isPinned(buildingId: string, trackId: string): boolean {
  const me = _getUserIdentity?.()?.id ?? 'anonymous';
  return getEntry(buildingId).tracks.some(
    (t) => t.id === trackId && (t.taggerId ?? 'anonymous') === me,
  );
}

/** Buildings where the CURRENT USER has pinned at least one track,
 *  newest-first by their most recent pin. Powers the "내 플레이리스트
 *  바로가기" shortcut list in the left rail — clicking a row jumps
 *  the camera + selection to that building. */
export type MyBuildingShortcut = {
  buildingId: string;
  /** How many tracks I personally pinned in that building. */
  trackCount: number;
  /** Newest track I pinned there — used as the row's preview cover
   *  + "Title — Artist" label. */
  latestTrack: PinnedTrack;
  /** Latest pinnedAt from my own tracks — sort key. */
  latestPinnedAt: number;
};

export function getMyBuildings(): MyBuildingShortcut[] {
  const me = _getUserIdentity?.();
  if (!me?.id) return [];
  const out: MyBuildingShortcut[] = [];
  for (const [buildingId, entry] of Object.entries(store)) {
    const mine = entry.tracks.filter((t) => t.taggerId === me.id);
    if (mine.length === 0) continue;
    const latest = mine.reduce((a, b) => (a.pinnedAt > b.pinnedAt ? a : b));
    out.push({
      buildingId,
      trackCount: mine.length,
      latestTrack: latest,
      latestPinnedAt: latest.pinnedAt,
    });
  }
  out.sort((a, b) => b.latestPinnedAt - a.latestPinnedAt);
  return out;
}

/** Injected at app init — provides current user identity for tagger stamps. */
let _getUserIdentity: (() => { id: string; name: string; avatarUrl?: string | null } | null) | null = null;

/** Optional hook that sends a like toggle to the shared (Supabase)
 *  backend. Set from main.tsx so this leaf module never imports the
 *  server module directly. When unset (offline / Supabase disabled),
 *  toggles still update the local store the legacy way. */
let _shareTrackLike: ((buildingId: string, trackId: string) => void) | null = null;
let _sharePlaylistLike: ((buildingId: string, taggerId: string) => void) | null = null;
export function setSharedLikeBridge(
  trackFn: (b: string, t: string) => void,
  playlistFn: (b: string, t: string) => void,
): void {
  _shareTrackLike = trackFn;
  _sharePlaylistLike = playlistFn;
}

/** Same pattern for shared pins — main.tsx wires the Supabase
 *  upsert / delete writers in. pinTrack / unpinTrack mirror to the
 *  server after the local store update. */
let _sharePinTrack: ((buildingId: string, track: RecommendedTrack) => void) | null = null;
let _shareUnpinTrack: ((buildingId: string, trackId: string) => void) | null = null;
export function setSharedPinBridge(
  pinFn: (b: string, t: RecommendedTrack) => void,
  unpinFn: (b: string, tid: string) => void,
): void {
  _sharePinTrack = pinFn;
  _shareUnpinTrack = unpinFn;
}

/** Call once at app startup to wire the auth store into the playlist module. */
export function setUserIdentityProvider(fn: () => { id: string; name: string; avatarUrl?: string | null } | null): void {
  _getUserIdentity = fn;
}

/** Add a track to a building's playlist. No-op if THE CURRENT USER
 *  has already pinned this track here — but a different curator's
 *  pin of the same track does NOT block me, because the store keeps
 *  one row per (track, tagger) pair so each user has an independent
 *  per-building playlist. Stamps the current user as tagger via the
 *  identity provider. */
export function pinTrack(buildingId: string, track: RecommendedTrack): void {
  const entry = getEntry(buildingId);
  const identity = _getUserIdentity?.() ?? null;
  const myId = identity?.id ?? 'anonymous';
  if (entry.tracks.some(
    (t) => t.id === track.id && (t.taggerId ?? 'anonymous') === myId,
  )) return;

  store = {
    ...store,
    [buildingId]: {
      // Spread the existing entry FIRST so taggerPlaylistCovers /
      // taggerPlaylistNames / taggerNotes / playlistLikedBy survive.
      // The previous shape only copied { tracks, description },
      // silently wiping every per-tagger custom field — which meant
      // adding a new track would erase the user's uploaded playlist
      // cover and inline-edited name.
      ...entry,
      tracks: [
        ...entry.tracks,
        {
          ...track,
          pinnedAt: Date.now(),
          taggerName: identity?.name,
          taggerId: identity?.id,
          taggerAvatarUrl: identity?.avatarUrl ?? null,
          likes: 0,
          likedBy: [],
        },
      ],
    },
  };
  saveToStorage();
  notify();
  // Mirror to Supabase so other users see the new pin globally + via
  // realtime push. Bridge handles auth gating (uuid only) and
  // Supabase configuration; no-op when offline / dev-admin.
  if (_sharePinTrack) _sharePinTrack(buildingId, track);
}

/** Toggle like on a pinned track. Returns new like count. */
export function toggleLike(buildingId: string, trackId: string): number {
  const entry = store[buildingId];
  if (!entry) return 0;

  const userId = _getUserIdentity?.()?.id ?? 'anonymous';

  store = {
    ...store,
    [buildingId]: {
      ...entry,
      tracks: entry.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const likedBy = t.likedBy ?? [];
        const alreadyLiked = likedBy.includes(userId);
        const nextLikedBy = alreadyLiked
          ? likedBy.filter((id) => id !== userId)
          : [...likedBy, userId];
        return {
          ...t,
          likedBy: nextLikedBy,
          likes: nextLikedBy.length,
        };
      }),
    },
  };
  saveToStorage();
  notify();
  // Mirror to the shared (Supabase) backend so the like also shows
  // up on every other user's screen via the realtime channel. The
  // bridge handles auth gating + uuid validation; no-op when offline.
  if (_shareTrackLike) _shareTrackLike(buildingId, trackId);

  const updated = store[buildingId]?.tracks.find((t) => t.id === trackId);
  return updated?.likes ?? 0;
}

/** Aggregated tagger group for a building — used by the "top playlist" card. */
export type TaggerGroup = {
  taggerId: string;
  taggerName: string;
  taggerAvatarUrl: string | null;
  /** Album artwork of the playlist's most-liked / most-recent track.
   *  Used as the playlist's default thumbnail (Spotify-style "made
   *  by the song" cover) when the curator hasn't uploaded their own
   *  avatar. Null only if every pinned track lacks artwork. */
  coverArtworkUrl: string | null;
  /** Top-4 track artworks for the 2×2 mosaic cover. Empty when no
   *  tracks have artwork. The PlaylistCover component picks the
   *  mosaic when there are 4+ entries, single image when 1–3, and
   *  monogram when 0. */
  coverGridUrls: string[];
  /** Curator-supplied custom playlist cover (path or URL). Takes
   *  priority over the mosaic / single-track artwork when set. */
  customCoverUrl: string | null;
  /** Combined ranking score = playlistLikes + sum(trackLikes). */
  totalLikes: number;
  /** Hearts the playlist itself received (independent of track likes). */
  playlistLikes: number;
  trackCount: number;
  /** Stable, deterministic alias generated from taggerId so the card
   *  always shows the same "playlist nickname" for that tagger. */
  alias: string;
  /** Most recent pinnedAt across the tagger's tracks (for tie-break). */
  latestAt: number;
};

const ALIAS_WORDS = [
  'midnight', 'neon', 'static', 'velvet', 'paper', 'glass', 'ember',
  'fog', 'echo', 'tide', 'silk', 'rust', 'amber', 'drift', 'pulse',
  'lantern', 'cobalt', 'hush', 'aurora', 'mono',
];
const ALIAS_NOUNS = [
  'tape', 'walk', 'set', 'mixtape', 'chapter', 'loop', 'diary',
  'transit', 'corridor', 'window', 'rooftop', 'station', 'circuit',
];

function generateAlias(taggerId: string): string {
  let h = 2166136261;
  for (let i = 0; i < taggerId.length; i++) {
    h ^= taggerId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const w = ALIAS_WORDS[(h >>> 0) % ALIAS_WORDS.length];
  const n = ALIAS_NOUNS[(h >>> 8) % ALIAS_NOUNS.length];
  return `${w}.${n}`;
}

/** Group all pinned tracks for a building by tagger, return ranked by
 *  total likes (desc). Ties broken by most-recent activity. */
export function getTopTaggers(buildingId: string, limit = 3): TaggerGroup[] {
  const entry = store[buildingId];
  if (!entry || entry.tracks.length === 0) return [];

  const groups = new Map<string, TaggerGroup>();
  // Per-tagger artwork accumulator: every distinct artwork URL with
  // its (likes, pinnedAt) tuple. We later sort and pick the top 4
  // for the mosaic, and the strongest one for the single-image
  // fallback (coverArtworkUrl).
  const artworkBuckets = new Map<
    string,
    Map<string, { likes: number; pinnedAt: number }>
  >();
  for (const t of entry.tracks) {
    const id = t.taggerId ?? 'anonymous';
    const name = t.taggerName ?? 'Anonymous';
    const existing = groups.get(id);
    if (existing) {
      existing.totalLikes += t.likes ?? 0;
      existing.trackCount += 1;
      existing.latestAt = Math.max(existing.latestAt, t.pinnedAt);
      // First non-empty custom cover URL wins — they should be
      // identical across a tagger's tracks anyway, but be defensive.
      if (!existing.customCoverUrl && t.taggerCustomCoverUrl) {
        existing.customCoverUrl = t.taggerCustomCoverUrl;
      }
    } else {
      groups.set(id, {
        taggerId: id,
        taggerName: name,
        taggerAvatarUrl: t.taggerAvatarUrl ?? null,
        coverArtworkUrl: null, // filled below
        coverGridUrls: [],     // filled below
        customCoverUrl: t.taggerCustomCoverUrl ?? null,
        totalLikes: t.likes ?? 0,
        playlistLikes: 0,
        trackCount: 1,
        alias: generateAlias(id),
        latestAt: t.pinnedAt,
      });
    }
    const tArt = t.artworkUrl || null;
    if (tArt) {
      let bucket = artworkBuckets.get(id);
      if (!bucket) { bucket = new Map(); artworkBuckets.set(id, bucket); }
      const cur = bucket.get(tArt);
      const tLikes = t.likes ?? 0;
      if (!cur || tLikes > cur.likes
              || (tLikes === cur.likes && t.pinnedAt > cur.pinnedAt)) {
        bucket.set(tArt, { likes: tLikes, pinnedAt: t.pinnedAt });
      }
    }
  }
  for (const g of groups.values()) {
    const bucket = artworkBuckets.get(g.taggerId);
    if (!bucket) continue;
    const ranked = Array.from(bucket.entries())
      .sort((a, b) => {
        if (b[1].likes !== a[1].likes) return b[1].likes - a[1].likes;
        return b[1].pinnedAt - a[1].pinnedAt;
      })
      .map(([url]) => url);
    g.coverArtworkUrl = ranked[0] ?? null;
    g.coverGridUrls = ranked.slice(0, 4);
  }

  // Fold playlist-level likes into the ranking score.
  const playlistLikes = entry.playlistLikedBy ?? {};
  // User-uploaded covers override the seed `taggerCustomCoverUrl`.
  // Empty-string sentinels mean "user explicitly cleared the cover" —
  // we fall back to the mosaic instead of the seed image.
  const userCovers = entry.taggerPlaylistCovers ?? {};
  // Live identity overlay — `taggerName` / `taggerAvatarUrl` are
  // baked into each PinnedTrack at pin time, so they go stale when
  // the current user later edits their My Page nickname or avatar.
  // For the signed-in user's own group we substitute the LIVE values
  // from the auth store on every render. Result: nickname change in
  // My Page → curator headline on hovering panels (PlaylistDetailView,
  // RankRow, AddTrackComposer playlist matches, etc.) updates without
  // needing to repin every track.
  const me = _getUserIdentity?.() ?? null;
  for (const g of groups.values()) {
    const pl = playlistLikes[g.taggerId]?.length ?? 0;
    g.playlistLikes = pl;
    g.totalLikes += pl;
    if (Object.prototype.hasOwnProperty.call(userCovers, g.taggerId)) {
      const v = userCovers[g.taggerId];
      g.customCoverUrl = typeof v === 'string' && v.length > 0 ? v : null;
    }
    if (me && g.taggerId === me.id) {
      if (me.name) g.taggerName = me.name;
      if (me.avatarUrl !== undefined) g.taggerAvatarUrl = me.avatarUrl ?? null;
    }
  }

  return [...groups.values()]
    // Product rule: only groups with MIN_PLAYLIST_TRACKS+ qualify.
    .filter((g) => g.trackCount >= MIN_PLAYLIST_TRACKS)
    .sort((a, b) => b.totalLikes - a.totalLikes || b.latestAt - a.latestAt)
    .slice(0, limit);
}

/** Toggle the current user's like on a tagger's playlist (separate
 *  from track-level likes). Returns the new playlist-like count. */
export function togglePlaylistLike(buildingId: string, taggerId: string): number {
  const entry = getEntry(buildingId);
  const userId = _getUserIdentity?.()?.id ?? 'anonymous';
  const map = { ...(entry.playlistLikedBy ?? {}) };
  const current = map[taggerId] ?? [];
  const liked = current.includes(userId);
  map[taggerId] = liked
    ? current.filter((id) => id !== userId)
    : [...current, userId];
  store = {
    ...store,
    [buildingId]: { ...entry, playlistLikedBy: map },
  };
  saveToStorage();
  notify();
  if (_sharePlaylistLike) _sharePlaylistLike(buildingId, taggerId);
  return map[taggerId].length;
}

export function isPlaylistLikedByMe(buildingId: string, taggerId: string): boolean {
  const userId = _getUserIdentity?.()?.id ?? 'anonymous';
  return store[buildingId]?.playlistLikedBy?.[taggerId]?.includes(userId) ?? false;
}

/** React hook — re-renders when the ranked tagger list changes. */
export function useTopTaggers(buildingId: string, limit = 3): TaggerGroup[] {
  const [list, setList] = useState<TaggerGroup[]>(() => getTopTaggers(buildingId, limit));
  useEffect(() => {
    const refresh = () => setList(getTopTaggers(buildingId, limit));
    refresh();
    const l: Listener = () => refresh();
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [buildingId, limit]);
  return list;
}

/** Tracks pinned by a specific tagger in this building, newest-first. */
export function getTracksByTagger(buildingId: string, taggerId: string): PinnedTrack[] {
  const entry = store[buildingId];
  if (!entry) return [];
  return entry.tracks
    .filter((t) => (t.taggerId ?? 'anonymous') === taggerId)
    .sort((a, b) => b.pinnedAt - a.pinnedAt);
}

/** Single tagger group (re-computed from current tracks). */
export function getTaggerGroup(buildingId: string, taggerId: string): TaggerGroup | null {
  return getTopTaggers(buildingId, 1000).find((g) => g.taggerId === taggerId) ?? null;
}

/** Popularity scope — used to label the "popular track" card.
 *   - 'building' → derived from this building's own pinned tracks
 *   - 'nearby'   → fallback aggregated across other buildings (block/동/구)
 */
export type PopularScope = 'building' | 'nearby';

export type PopularTrack = {
  track: PinnedTrack;
  scope: PopularScope;
  /** How many distinct buildings (or pin instances) include this track. */
  pinCount: number;
  /** Total likes across the scope. */
  totalLikes: number;
  /** Number of buildings considered in the aggregation (>=1). */
  buildingCount: number;
};

/** Top N popular tracks for a building.
 *
 * Ranking metric is the number of TIMES a track is "수록" — included
 * across the relevant playlist scope. Likes only break ties.
 *
 *  - 'building' scope: count distinct TAGGERS in this building who
 *    pinned the track. (Same track pinned by 3 curators in one
 *    building → pinCount = 3, "수록 3회".)
 *  - 'nearby' fallback (this building has zero pins): count distinct
 *    BUILDINGS where the track appears.
 */
export function getTopTracks(buildingId: string, n = 3): PopularTrack[] {
  // 1) Per-building — group by trackId, count distinct taggers.
  const local = store[buildingId]?.tracks ?? [];
  if (local.length > 0) {
    type Agg = {
      track: PinnedTrack;
      taggers: Set<string>;
      totalLikes: number;
      latestPinnedAt: number;
    };
    const counts = new Map<string, Agg>();
    for (const t of local) {
      const ex = counts.get(t.id);
      if (ex) {
        if (t.taggerId) ex.taggers.add(t.taggerId);
        ex.totalLikes += t.likes ?? 0;
        if (t.pinnedAt > ex.latestPinnedAt) ex.latestPinnedAt = t.pinnedAt;
      } else {
        counts.set(t.id, {
          track: t,
          taggers: new Set(t.taggerId ? [t.taggerId] : []),
          totalLikes: t.likes ?? 0,
          latestPinnedAt: t.pinnedAt,
        });
      }
    }
    return [...counts.values()]
      .sort((a, b) =>
        b.taggers.size - a.taggers.size ||
        b.totalLikes - a.totalLikes ||
        b.latestPinnedAt - a.latestPinnedAt,
      )
      .slice(0, n)
      .map((c) => ({
        track: c.track,
        scope: 'building' as const,
        pinCount: Math.max(1, c.taggers.size),
        totalLikes: c.totalLikes,
        buildingCount: 1,
      }));
  }

  // 2) Fallback — aggregate across every other building.
  const counts = new Map<string, {
    track: PinnedTrack; pinCount: number; totalLikes: number;
  }>();
  let buildingsSeen = 0;
  for (const [bid, entry] of Object.entries(store)) {
    if (bid === buildingId) continue;
    if (entry.tracks.length === 0) continue;
    buildingsSeen += 1;
    for (const t of entry.tracks) {
      const ex = counts.get(t.id);
      if (ex) {
        ex.pinCount += 1;
        ex.totalLikes += t.likes ?? 0;
      } else {
        counts.set(t.id, { track: t, pinCount: 1, totalLikes: t.likes ?? 0 });
      }
    }
  }
  if (counts.size === 0) return [];
  return [...counts.values()]
    .sort((a, b) => b.pinCount - a.pinCount || b.totalLikes - a.totalLikes)
    .slice(0, n)
    .map((c) => ({
      track: c.track,
      scope: 'nearby' as const,
      pinCount: c.pinCount,
      totalLikes: c.totalLikes,
      buildingCount: buildingsSeen,
    }));
}

/** Back-compat single-top accessor — uses `getTopTracks` under the hood. */
export function getTopTrack(buildingId: string): PopularTrack | null {
  return getTopTracks(buildingId, 1)[0] ?? null;
}

export function useTopTracks(buildingId: string, n = 3): PopularTrack[] {
  const [tops, setTops] = useState<PopularTrack[]>(
    () => getTopTracks(buildingId, n),
  );
  useEffect(() => {
    const refresh = () => setTops(getTopTracks(buildingId, n));
    refresh();
    const l: Listener = () => refresh();
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [buildingId, n]);
  return tops;
}

export function useTopTrack(buildingId: string): PopularTrack | null {
  const [top, setTop] = useState<PopularTrack | null>(() => getTopTrack(buildingId));
  useEffect(() => {
    const refresh = () => setTop(getTopTrack(buildingId));
    refresh();
    const l: Listener = () => refresh();
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [buildingId]);
  return top;
}

/** Per-tagger custom playlist NAME (the only user-editable string on
 *  a playlist as of 2026-04-27). Empty string = "no custom name set,
 *  fall back to the curator's display name". */
export function getTaggerPlaylistName(buildingId: string, taggerId: string): string {
  return store[buildingId]?.taggerPlaylistNames?.[taggerId] ?? '';
}

export function setTaggerPlaylistName(buildingId: string, taggerId: string, name: string): void {
  const entry = getEntry(buildingId);
  store = {
    ...store,
    [buildingId]: {
      ...entry,
      taggerPlaylistNames: { ...(entry.taggerPlaylistNames ?? {}), [taggerId]: name },
    },
  };
  saveToStorage();
  notify();
}

/** Per-tagger custom cover read. Returns the user-uploaded URL when
 *  set (empty string = explicitly cleared → null), else the seed
 *  `taggerCustomCoverUrl` from one of this tagger's pinned tracks,
 *  else null. Used by surfaces like the right-rail MY PLAYLIST card
 *  that don't already pay the full `getTaggerGroup` cost. */
export function getTaggerPlaylistCover(buildingId: string, taggerId: string): string | null {
  const entry = store[buildingId];
  if (!entry) return null;
  const userMap = entry.taggerPlaylistCovers;
  if (userMap && Object.prototype.hasOwnProperty.call(userMap, taggerId)) {
    const v = userMap[taggerId];
    return typeof v === 'string' && v.length > 0 ? v : null;
  }
  // Fall back to whatever the seed tracks declared (kept for back-compat
  // with the persona seed data; production users won't have a seed).
  for (const t of entry.tracks) {
    if ((t.taggerId ?? 'anonymous') === taggerId && t.taggerCustomCoverUrl) {
      return t.taggerCustomCoverUrl;
    }
  }
  return null;
}

/** Per-tagger custom cover (data URL or remote URL). Pass an empty
 *  string to clear and fall back to the mosaic. */
export function setTaggerPlaylistCover(buildingId: string, taggerId: string, url: string): void {
  const entry = getEntry(buildingId);
  store = {
    ...store,
    [buildingId]: {
      ...entry,
      taggerPlaylistCovers: { ...(entry.taggerPlaylistCovers ?? {}), [taggerId]: url },
    },
  };
  saveToStorage();
  notify();
}

/** Hook bundling everything needed for the playlist detail view. */
export function useTaggerPlaylist(buildingId: string, taggerId: string): {
  group: TaggerGroup | null;
  tracks: PinnedTrack[];
  name: string;
  setName: (name: string) => void;
  setCover: (url: string) => void;
  isMine: boolean;
} {
  const [snap, setSnap] = useState(() => ({
    group: getTaggerGroup(buildingId, taggerId),
    tracks: getTracksByTagger(buildingId, taggerId),
    name: getTaggerPlaylistName(buildingId, taggerId),
  }));
  useEffect(() => {
    const refresh = () => setSnap({
      group: getTaggerGroup(buildingId, taggerId),
      tracks: getTracksByTagger(buildingId, taggerId),
      name: getTaggerPlaylistName(buildingId, taggerId),
    });
    refresh();
    const l: Listener = () => refresh();
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [buildingId, taggerId]);

  const myId = _getUserIdentity?.()?.id ?? 'anonymous';
  return {
    ...snap,
    isMine: myId === taggerId,
    setName: (name: string) => setTaggerPlaylistName(buildingId, taggerId, name),
    setCover: (url: string) => setTaggerPlaylistCover(buildingId, taggerId, url),
  };
}

/** Check if current user liked a track. */
export function isLikedByMe(buildingId: string, trackId: string): boolean {
  const userId = _getUserIdentity?.()?.id ?? 'anonymous';
  const entry = store[buildingId];
  if (!entry) return false;
  const track = entry.tracks.find((t) => t.id === trackId);
  return track?.likedBy?.includes(userId) ?? false;
}

/** Remove a track from a building's playlist. Drops the entry entirely
 *  when no tracks AND no description remain, so the store stays tidy. */
export function unpinTrack(buildingId: string, trackId: string): void {
  const entry = store[buildingId];
  if (!entry || !entry.tracks.some((t) => t.id === trackId)) return;
  const nextTracks = entry.tracks.filter((t) => t.id !== trackId);
  // Auto-remove the entry only when there is genuinely nothing left
  // to remember. Previously this checked just `description`, so
  // unpinning the last track would silently drop the user's uploaded
  // cover and any custom playlist name. Widened to look at every
  // per-tagger field that the user can populate from the UI.
  const hasCovers = !!entry.taggerPlaylistCovers
    && Object.keys(entry.taggerPlaylistCovers).length > 0;
  const hasNames = !!entry.taggerPlaylistNames
    && Object.keys(entry.taggerPlaylistNames).length > 0;
  const hasLikes = !!entry.playlistLikedBy
    && Object.values(entry.playlistLikedBy).some((arr) => arr && arr.length > 0);
  if (
    nextTracks.length === 0
    && !entry.description
    && !hasCovers
    && !hasNames
    && !hasLikes
  ) {
    const { [buildingId]: _removed, ...rest } = store;
    store = rest;
  } else {
    store = {
      ...store,
      // Spread the existing entry so every per-tagger custom field
      // (covers, names, notes, likes) survives unpinning a track.
      [buildingId]: { ...entry, tracks: nextTracks },
    };
  }
  saveToStorage();
  notify();
  // Mirror to Supabase so the unpin propagates to every other client.
  if (_shareUnpinTrack) _shareUnpinTrack(buildingId, trackId);
}

/** Update the user's free-text description for a building's playlist.
 *  Empty strings are stored as-is (we still want to remember "the user
 *  cleared it"); the UI gate decides when to render the input. */
export function setDescription(buildingId: string, description: string): void {
  const entry = getEntry(buildingId);
  store = {
    ...store,
    // Spread `...entry` so taggerPlaylistCovers / taggerPlaylistNames /
    // taggerNotes / playlistLikedBy aren't dropped when only the
    // building-wide description changes.
    [buildingId]: { ...entry, description },
  };
  saveToStorage();
  notify();
}

/** React hook — re-renders the consumer whenever this building's
 *  playlist changes. Returns the current pinned list, description,
 *  plus bound helpers so call sites don't have to thread `buildingId`
 *  through every callback. */
export function usePlaylist(buildingId: string): {
  tracks: PinnedTrack[];
  description: string;
  isPinned: (trackId: string) => boolean;
  pin: (track: RecommendedTrack) => void;
  unpin: (trackId: string) => void;
  setDescription: (description: string) => void;
  toggleLike: (trackId: string) => number;
  isLikedByMe: (trackId: string) => boolean;
} {
  const [snapshot, setSnapshot] = useState<{
    tracks: PinnedTrack[];
    description: string;
  }>(() => ({
    tracks: getPinned(buildingId),
    description: getDescription(buildingId),
  }));

  useEffect(() => {
    const refresh = () =>
      setSnapshot({
        tracks: getPinned(buildingId),
        description: getDescription(buildingId),
      });
    refresh();
    const l: Listener = () => refresh();
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [buildingId]);

  return {
    tracks: snapshot.tracks,
    description: snapshot.description,
    isPinned: (trackId: string) => isPinned(buildingId, trackId),
    pin: (track: RecommendedTrack) => pinTrack(buildingId, track),
    unpin: (trackId: string) => unpinTrack(buildingId, trackId),
    setDescription: (description: string) => setDescription(buildingId, description),
    toggleLike: (trackId: string) => toggleLike(buildingId, trackId),
    isLikedByMe: (trackId: string) => isLikedByMe(buildingId, trackId),
  };
}
