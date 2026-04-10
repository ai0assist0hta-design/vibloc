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
};

export type BuildingPlaylistEntry = {
  tracks: PinnedTrack[];
  description: string;
};

const STORAGE_KEY = 'vibloc.playlists.v1';

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
        };
      }
    }
    return out;
  } catch {
    return {};
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

/** Add a track to a building's playlist. No-op if already pinned. */
export function pinTrack(buildingId: string, track: RecommendedTrack): void {
  const entry = getEntry(buildingId);
  if (entry.tracks.some((t) => t.id === track.id)) return;
  store = {
    ...store,
    [buildingId]: {
      tracks: [...entry.tracks, { ...track, pinnedAt: Date.now() }],
      description: entry.description,
    },
  };
  saveToStorage();
  notify();
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
  };
}
