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
  /** Per-playlist (per-tagger) likes — userIds who liked the playlist
   *  itself (separate from per-track likes). Surfaces the heart pill
   *  on the TopTaggerCard rank rows. */
  playlistLikedBy?: Record<string, string[]>;
};

const STORAGE_KEY = 'vibloc.playlists.v1';

/** Product rule: a tagger's tracks only qualify as a "playlist" once
 *  they reach 3+ tracks. Below this, the group is considered a draft
 *  — it is NOT surfaced in TOP PLAYLISTS rankings, doesn't get a
 *  description input, and is hidden from cross-building popularity
 *  fallbacks. The threshold lives here so every consumer agrees. */
export const MIN_PLAYLIST_TRACKS = 3;

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

export function isPinned(buildingId: string, trackId: string): boolean {
  return getEntry(buildingId).tracks.some((t) => t.id === trackId);
}

/** Injected at app init — provides current user identity for tagger stamps. */
let _getUserIdentity: (() => { id: string; name: string; avatarUrl?: string | null } | null) | null = null;

/** Call once at app startup to wire the auth store into the playlist module. */
export function setUserIdentityProvider(fn: () => { id: string; name: string; avatarUrl?: string | null } | null): void {
  _getUserIdentity = fn;
}

/** Add a track to a building's playlist. No-op if already pinned.
 *  Stamps the current user as tagger via the identity provider. */
export function pinTrack(buildingId: string, track: RecommendedTrack): void {
  const entry = getEntry(buildingId);
  if (entry.tracks.some((t) => t.id === track.id)) return;

  const identity = _getUserIdentity?.() ?? null;

  store = {
    ...store,
    [buildingId]: {
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
      description: entry.description,
    },
  };
  saveToStorage();
  notify();
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

  const updated = store[buildingId]?.tracks.find((t) => t.id === trackId);
  return updated?.likes ?? 0;
}

/** Aggregated tagger group for a building — used by the "top playlist" card. */
export type TaggerGroup = {
  taggerId: string;
  taggerName: string;
  taggerAvatarUrl: string | null;
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
  for (const t of entry.tracks) {
    const id = t.taggerId ?? 'anonymous';
    const name = t.taggerName ?? 'Anonymous';
    const existing = groups.get(id);
    if (existing) {
      existing.totalLikes += t.likes ?? 0;
      existing.trackCount += 1;
      existing.latestAt = Math.max(existing.latestAt, t.pinnedAt);
    } else {
      groups.set(id, {
        taggerId: id,
        taggerName: name,
        taggerAvatarUrl: t.taggerAvatarUrl ?? null,
        totalLikes: t.likes ?? 0,
        playlistLikes: 0,
        trackCount: 1,
        alias: generateAlias(id),
        latestAt: t.pinnedAt,
      });
    }
  }

  // Fold playlist-level likes into the ranking score.
  const playlistLikes = entry.playlistLikedBy ?? {};
  for (const g of groups.values()) {
    const pl = playlistLikes[g.taggerId]?.length ?? 0;
    g.playlistLikes = pl;
    g.totalLikes += pl;
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

/** Most popular track for a building.
 *  Within the building → ranked by likes (each track appears once).
 *  When the building has no pins → falls back to global pin count. */
export function getTopTrack(buildingId: string): PopularTrack | null {
  // 1) Per-building — pick the track with the most likes (then most recent).
  const local = store[buildingId]?.tracks ?? [];
  if (local.length > 0) {
    const top = [...local].sort((a, b) =>
      (b.likes ?? 0) - (a.likes ?? 0) || b.pinnedAt - a.pinnedAt
    )[0];
    return {
      track: top,
      scope: 'building',
      pinCount: 1,
      totalLikes: top.likes ?? 0,
      buildingCount: 1,
    };
  }

  // 2) Fallback — count pins across every other building. Treat each
  //    distinct (buildingId, trackId) as one "addition to a playlist".
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
  if (counts.size === 0) return null;
  const top = [...counts.values()].sort((a, b) =>
    b.pinCount - a.pinCount || b.totalLikes - a.totalLikes
  )[0];
  return {
    track: top.track,
    scope: 'nearby',
    pinCount: top.pinCount,
    totalLikes: top.totalLikes,
    buildingCount: buildingsSeen,
  };
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

/** Hook bundling everything needed for the playlist detail view. */
export function useTaggerPlaylist(buildingId: string, taggerId: string): {
  group: TaggerGroup | null;
  tracks: PinnedTrack[];
  name: string;
  setName: (name: string) => void;
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
  if (nextTracks.length === 0 && !entry.description) {
    const { [buildingId]: _removed, ...rest } = store;
    store = rest;
  } else {
    store = {
      ...store,
      [buildingId]: { tracks: nextTracks, description: entry.description },
    };
  }
  saveToStorage();
  notify();
}

/** Update the user's free-text description for a building's playlist.
 *  Empty strings are stored as-is (we still want to remember "the user
 *  cleared it"); the UI gate decides when to render the input. */
export function setDescription(buildingId: string, description: string): void {
  const entry = getEntry(buildingId);
  store = {
    ...store,
    [buildingId]: { tracks: entry.tracks, description },
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
