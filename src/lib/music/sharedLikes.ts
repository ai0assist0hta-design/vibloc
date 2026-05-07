/**
 * Shared (multi-user) track + playlist likes via Supabase.
 *
 * Goal: the heart counts and "liked by me" state on every right-rail
 * surface (TrackRow, RankRow, PlaylistDetailView, FeaturedHero, etc.)
 * reflect the WHOLE community in real time — not just the local
 * browser's optimistic state. Two tables (`track_likes`,
 * `playlist_likes`) carry the canonical truth; this module mirrors
 * them into an in-memory cache, dual-writes on toggle, and reacts to
 * Supabase Realtime push events for cross-client live sync.
 *
 * The existing `buildingPlaylist` store stays untouched on disk —
 * its own `entry.tracks[i].likedBy` and `entry.playlistLikedBy` keep
 * working for offline / dev-admin / signed-out scenarios. At read
 * time the server cache UNIONS into those structures so every UI
 * heart count is `local ∪ server`. Local writes are optimistic.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/useAuthStore';

// ─────────────────────────────────────────────────────────────
//  In-memory cache
// ─────────────────────────────────────────────────────────────
// `${buildingId}|${trackId}` → Set of userIds who liked the track
const _trackLikes = new Map<string, Set<string>>();
// `${buildingId}|${taggerId}` → Set of userIds who liked the playlist
const _playlistLikes = new Map<string, Set<string>>();

const listeners = new Set<() => void>();
function notify() { for (const l of listeners) l(); }

/** Subscribe to ANY shared-likes change (initial hydration, local
 *  toggle, or remote Realtime push). Caller is responsible for
 *  re-reading the relevant `getServer*` getters in the listener. */
export function subscribeSharedLikes(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ─────────────────────────────────────────────────────────────
//  Read helpers — surface the (count, mineFlag) tuple the UI needs
// ─────────────────────────────────────────────────────────────
function trackKey(buildingId: string, trackId: string): string {
  return `${buildingId}|${trackId}`;
}
function playlistKey(buildingId: string, taggerId: string): string {
  return `${buildingId}|${taggerId}`;
}

/** Server-side likers for a (building, track) pair. */
export function getServerTrackLikers(buildingId: string, trackId: string): ReadonlySet<string> {
  return _trackLikes.get(trackKey(buildingId, trackId)) ?? EMPTY_SET;
}
/** Server-side likers for a (building, tagger) playlist. */
export function getServerPlaylistLikers(buildingId: string, taggerId: string): ReadonlySet<string> {
  return _playlistLikes.get(playlistKey(buildingId, taggerId)) ?? EMPTY_SET;
}
const EMPTY_SET: ReadonlySet<string> = new Set();

// ─────────────────────────────────────────────────────────────
//  Toggles — optimistic local, async server write
// ─────────────────────────────────────────────────────────────
function getMyId(): string | null {
  const u = useAuthStore.getState().user;
  return u?.id ?? null;
}

/** Returns true if the row currently shows "I like this" AFTER the
 *  toggle (so the caller can update its local mirror to match). */
export async function toggleSharedTrackLike(
  buildingId: string,
  trackId: string,
): Promise<boolean> {
  const me = getMyId();
  if (!me || !isSupabaseConfigured()) return false;
  const key = trackKey(buildingId, trackId);
  const set = _trackLikes.get(key) ?? new Set<string>();
  const wasLiked = set.has(me);
  // Optimistic local update — UI reflects immediately, the network
  // call below either confirms (no-op) or rolls back on error.
  if (wasLiked) set.delete(me); else set.add(me);
  _trackLikes.set(key, set);
  notify();
  try {
    if (wasLiked) {
      const { error } = await supabase()
        .from('track_likes')
        .delete()
        .match({ building_id: buildingId, track_id: trackId, user_id: me });
      if (error) throw error;
    } else {
      const { error } = await supabase()
        .from('track_likes')
        .upsert(
          { building_id: buildingId, track_id: trackId, user_id: me },
          { onConflict: 'building_id,track_id,user_id', ignoreDuplicates: true },
        );
      if (error) throw error;
    }
    return !wasLiked;
  } catch {
    // Roll back the optimistic mutation on failure.
    if (wasLiked) set.add(me); else set.delete(me);
    _trackLikes.set(key, set);
    notify();
    return wasLiked;
  }
}

export async function toggleSharedPlaylistLike(
  buildingId: string,
  taggerId: string,
): Promise<boolean> {
  const me = getMyId();
  if (!me || !isSupabaseConfigured()) return false;
  // Server schema requires tagger_id::uuid — gate on uuid-shaped
  // strings so dev-admin / anonymous synthetic ids don't 400 the
  // request. (32 hex chars + 4 dashes = 36 chars; v4 layout.)
  if (!UUID_RE.test(taggerId)) return false;
  const key = playlistKey(buildingId, taggerId);
  const set = _playlistLikes.get(key) ?? new Set<string>();
  const wasLiked = set.has(me);
  if (wasLiked) set.delete(me); else set.add(me);
  _playlistLikes.set(key, set);
  notify();
  try {
    if (wasLiked) {
      const { error } = await supabase()
        .from('playlist_likes')
        .delete()
        .match({ building_id: buildingId, tagger_id: taggerId, user_id: me });
      if (error) throw error;
    } else {
      const { error } = await supabase()
        .from('playlist_likes')
        .upsert(
          { building_id: buildingId, tagger_id: taggerId, user_id: me },
          { onConflict: 'building_id,tagger_id,user_id', ignoreDuplicates: true },
        );
      if (error) throw error;
    }
    return !wasLiked;
  } catch {
    if (wasLiked) set.add(me); else set.delete(me);
    _playlistLikes.set(key, set);
    notify();
    return wasLiked;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─────────────────────────────────────────────────────────────
//  Hydration + Realtime subscription
// ─────────────────────────────────────────────────────────────
let _booted = false;
let _unsubscribe: (() => void) | null = null;

/** Pull every track/playlist like from Supabase and start a Realtime
 *  channel for live updates. Idempotent — calling twice is a no-op.
 *  Wire this from main.tsx once, then forget. */
export async function bootSharedLikes(): Promise<void> {
  if (_booted) return;
  if (!isSupabaseConfigured()) return;
  _booted = true;
  await hydrateFromServer();
  subscribeRealtime();
}

async function hydrateFromServer(): Promise<void> {
  try {
    const [tracksRes, plsRes] = await Promise.all([
      supabase().from('track_likes').select('building_id, track_id, user_id'),
      supabase().from('playlist_likes').select('building_id, tagger_id, user_id'),
    ]);
    if (!tracksRes.error) {
      _trackLikes.clear();
      for (const r of tracksRes.data ?? []) {
        const k = trackKey(r.building_id as string, r.track_id as string);
        let set = _trackLikes.get(k);
        if (!set) { set = new Set(); _trackLikes.set(k, set); }
        set.add(r.user_id as string);
      }
    }
    if (!plsRes.error) {
      _playlistLikes.clear();
      for (const r of plsRes.data ?? []) {
        const k = playlistKey(r.building_id as string, r.tagger_id as string);
        let set = _playlistLikes.get(k);
        if (!set) { set = new Set(); _playlistLikes.set(k, set); }
        set.add(r.user_id as string);
      }
    }
    notify();
  } catch {
    /* offline / RLS misconfigured — UI just shows local-only data */
  }
}

function subscribeRealtime(): void {
  try {
    const ch = supabase()
      .channel('vibloc-shared-likes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'track_likes' },
        (p) => applyTrackEvent(p),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'playlist_likes' },
        (p) => applyPlaylistEvent(p),
      )
      .subscribe();
    _unsubscribe = () => { void ch.unsubscribe(); };
  } catch {
    /* realtime channel failed to open — local cache still works */
  }
}

interface ChangePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

function applyTrackEvent(p: ChangePayload): void {
  const row = (p.new ?? p.old) as Record<string, unknown> | null;
  if (!row) return;
  const buildingId = row.building_id as string | undefined;
  const trackId = row.track_id as string | undefined;
  const userId = row.user_id as string | undefined;
  if (!buildingId || !trackId || !userId) return;
  const k = trackKey(buildingId, trackId);
  const set = _trackLikes.get(k) ?? new Set<string>();
  if (p.eventType === 'DELETE') set.delete(userId);
  else set.add(userId);
  _trackLikes.set(k, set);
  notify();
}

function applyPlaylistEvent(p: ChangePayload): void {
  const row = (p.new ?? p.old) as Record<string, unknown> | null;
  if (!row) return;
  const buildingId = row.building_id as string | undefined;
  const taggerId = row.tagger_id as string | undefined;
  const userId = row.user_id as string | undefined;
  if (!buildingId || !taggerId || !userId) return;
  const k = playlistKey(buildingId, taggerId);
  const set = _playlistLikes.get(k) ?? new Set<string>();
  if (p.eventType === 'DELETE') set.delete(userId);
  else set.add(userId);
  _playlistLikes.set(k, set);
  notify();
}

/** Tear down the Realtime subscription. Currently only used in tests
 *  / HMR — production never calls this. */
export function shutdownSharedLikes(): void {
  if (_unsubscribe) _unsubscribe();
  _unsubscribe = null;
  _booted = false;
}
