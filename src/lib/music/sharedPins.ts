/**
 * Shared (multi-user) pinned tracks via Supabase.
 *
 * Phase 2 of the multi-user backend cut. Every authenticated user's
 * pinned tracks land in `public.pinned_tracks`; everyone else's
 * client reads them, folds them into the in-memory building store,
 * and reacts to Supabase Realtime push so a pin in one tab on one
 * device appears in every other client without polling.
 *
 * The on-disk localStorage cache (`vibloc.playlists.v1`) keeps
 * working as a snapshot for offline / dev-admin / signed-out
 * scenarios. At read time the merger replaces a building's tracks
 * with the deduped UNION of local + remote so the existing UI
 * (which iterates `entry.tracks`) gains global visibility for free.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/useAuthStore';
import type { PinnedTrack } from './buildingPlaylist';
import type { RecommendedTrack } from './trackTypes';
import type { GenreKey } from '../../types';

// ─────────────────────────────────────────────────────────────
//  In-memory cache — buildingId → list of remote pins
// ─────────────────────────────────────────────────────────────
const _pinsByBuilding = new Map<string, PinnedTrack[]>();
const listeners = new Set<() => void>();
function notify() { for (const l of listeners) l(); }

export function subscribeSharedPins(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Read-only snapshot for callers (used by mergeSharedPinsIntoStore). */
export function getServerPinsForBuilding(buildingId: string): readonly PinnedTrack[] {
  return _pinsByBuilding.get(buildingId) ?? EMPTY_LIST;
}
const EMPTY_LIST: readonly PinnedTrack[] = [];

/** Every buildingId we have at least one server pin for. The merger
 *  uses this to know which local entries to overwrite with the
 *  authoritative server data. */
export function getServerPinBuildings(): readonly string[] {
  return [..._pinsByBuilding.keys()];
}

// ─────────────────────────────────────────────────────────────
//  DB row ↔ PinnedTrack codec
// ─────────────────────────────────────────────────────────────
type DbRow = {
  id: string;
  building_id: string;
  track_id: string;
  user_id: string;
  track_name: string;
  artist_name: string;
  artwork_url: string | null;
  preview_url: string | null;
  track_view_url: string | null;
  primary_genre_name: string | null;
  genre: string | null;
  tagger_name: string | null;
  tagger_avatar_url: string | null;
  pinned_at: string;
};

function rowToPin(r: DbRow): PinnedTrack {
  return {
    id: r.track_id,
    trackName: r.track_name,
    artistName: r.artist_name,
    artworkUrl: r.artwork_url ?? '',
    previewUrl: r.preview_url ?? '',
    primaryGenreName: r.primary_genre_name ?? '',
    genre: (r.genre ?? 'pop') as GenreKey,
    trackViewUrl: r.track_view_url ?? '',
    pinnedAt: new Date(r.pinned_at).getTime(),
    taggerId: r.user_id,
    taggerName: r.tagger_name ?? undefined,
    taggerAvatarUrl: r.tagger_avatar_url ?? null,
    likes: 0,
    likedBy: [],
  };
}

function pinToRow(
  buildingId: string,
  track: RecommendedTrack,
  user: { id: string; name?: string; avatarUrl?: string | null },
): Omit<DbRow, 'id' | 'pinned_at'> {
  return {
    building_id: buildingId,
    track_id: track.id,
    user_id: user.id,
    track_name: track.trackName,
    artist_name: track.artistName,
    artwork_url: track.artworkUrl || null,
    preview_url: track.previewUrl || null,
    track_view_url: track.trackViewUrl || null,
    primary_genre_name: track.primaryGenreName || null,
    genre: track.genre || null,
    tagger_name: user.name ?? null,
    tagger_avatar_url: user.avatarUrl ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
//  Hydrate + Realtime
// ─────────────────────────────────────────────────────────────
let _booted = false;
let _channel: ReturnType<ReturnType<typeof supabase>['channel']> | null = null;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function bootSharedPins(): Promise<void> {
  if (_booted || !isSupabaseConfigured()) return;
  _booted = true;
  await hydrateAll();
  subscribeRealtime();
}

async function hydrateAll(): Promise<void> {
  try {
    const { data, error } = await supabase()
      .from('pinned_tracks')
      .select('*')
      .order('pinned_at', { ascending: false });
    if (error) return;
    _pinsByBuilding.clear();
    for (const r of (data ?? []) as DbRow[]) {
      const list = _pinsByBuilding.get(r.building_id) ?? [];
      list.push(rowToPin(r));
      _pinsByBuilding.set(r.building_id, list);
    }
    notify();
  } catch {
    /* offline / RLS issue — local cache still works */
  }
}

function subscribeRealtime(): void {
  try {
    _channel = supabase()
      .channel('vibloc-shared-pins')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pinned_tracks' },
        (p) => applyEvent(p as ChangePayload),
      )
      .subscribe();
  } catch {
    /* realtime channel unavailable */
  }
}

interface ChangePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

function applyEvent(p: ChangePayload): void {
  const row = (p.new ?? p.old) as DbRow | null;
  if (!row || !row.building_id) return;
  const list = (_pinsByBuilding.get(row.building_id) ?? []).filter(
    (t) => !(t.id === row.track_id && t.taggerId === row.user_id),
  );
  if (p.eventType !== 'DELETE' && p.new) {
    list.unshift(rowToPin(row));
  }
  if (list.length > 0) _pinsByBuilding.set(row.building_id, list);
  else _pinsByBuilding.delete(row.building_id);
  notify();
}

// ─────────────────────────────────────────────────────────────
//  Mirror writes — called from the buildingPlaylist bridge
// ─────────────────────────────────────────────────────────────
function getMyIdentity(): { id: string; name?: string; avatarUrl?: string | null } | null {
  const u = useAuthStore.getState().user;
  if (!u || !UUID_RE.test(u.id)) return null;
  return {
    id: u.id,
    name: u.displayName || u.email,
    avatarUrl: u.avatarUrl ?? null,
  };
}

export async function shareTrackPin(buildingId: string, track: RecommendedTrack): Promise<void> {
  const me = getMyIdentity();
  if (!me || !isSupabaseConfigured()) return;
  try {
    const row = pinToRow(buildingId, track, me);
    const { error } = await supabase()
      .from('pinned_tracks')
      .upsert(row, { onConflict: 'building_id,track_id,user_id' });
    if (error) throw error;
  } catch {
    /* swallow — local pin already happened */
  }
}

export async function shareTrackUnpin(buildingId: string, trackId: string): Promise<void> {
  const me = getMyIdentity();
  if (!me || !isSupabaseConfigured()) return;
  try {
    const { error } = await supabase()
      .from('pinned_tracks')
      .delete()
      .match({ building_id: buildingId, track_id: trackId, user_id: me.id });
    if (error) throw error;
  } catch {
    /* swallow */
  }
}

export function shutdownSharedPins(): void {
  if (_channel) {
    void _channel.unsubscribe();
    _channel = null;
  }
  _booted = false;
}
