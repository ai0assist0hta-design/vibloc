/**
 * Singleton 30s preview player.
 *
 * Why a singleton?
 * ----------------
 * Multiple ▶ buttons may live in the same panel (RecommendedList +
 * future VibeDropFeed) and the new global NowPlayingBar at the
 * bottom of the viewport. When the user clicks one, ALL other
 * previews must stop instantly so we never have two tracks playing
 * on top of each other. The cleanest way to enforce that is a
 * single shared `<audio>` element managed by a tiny module-level
 * store and exposed via a hook.
 *
 * The audio element is created lazily (so SSR / pre-paint never
 * touches the DOM) and never unmounted — it follows the user across
 * the whole session, which is also what makes "click ▶ on track A,
 * close panel, open another building, ▶ track B" actually work.
 *
 * State carries enough metadata for the NowPlayingBar to render the
 * track without a separate lookup: title, artist, artwork URL, and
 * the canonical Apple Music URL for the "open in Apple Music" CTA.
 *
 * a11y: keyboard shortcut (Space) is wired in the consumer button
 * so focusable elements stay native and screen readers see real
 * `aria-pressed` state on each track row.
 */

import { useEffect, useState } from 'react';

type Listener = (state: PlayerState) => void;

export type TrackMeta = {
  title: string;
  artist: string;
  artworkUrl?: string;
  /** Canonical music.apple.com URL — wired to the NowPlayingBar's
   *  "Open in Apple Music" button. Falls back to a search URL inside
   *  the helper when missing. */
  appleUrl?: string;
};

export type PlayerState = {
  /** trackId currently loaded — null when idle. */
  currentId: string | null;
  /** True if `<audio>` is actively playing. */
  isPlaying: boolean;
  /** Metadata for the bottom bar. Null when idle. */
  meta: TrackMeta | null;
  /** Total preview duration in seconds (≈ 30 for iTunes previews). */
  duration: number;
  /** Current playhead position in seconds. */
  position: number;
  /** Optional queue (e.g. the building's #1 playlist) for prev / next
   *  navigation in the NowPlayingBar. Empty array = no nav, buttons
   *  render disabled. The current track index is derived from
   *  `queue.findIndex(t => t.id === currentId)`. */
  queue: QueueEntry[];
};

/** Trimmed track shape for queue nav — a queue entry needs the URL
 *  to play and the meta to show in the bar. */
export type QueueEntry = {
  id: string;
  url: string;
  meta: TrackMeta;
};

let audioEl: HTMLAudioElement | null = null;
let state: PlayerState = {
  currentId: null, isPlaying: false, meta: null, duration: 0, position: 0, queue: [],
};
const listeners = new Set<Listener>();

function ensureAudio(): HTMLAudioElement {
  if (audioEl) return audioEl;
  if (typeof window === 'undefined') {
    return {} as HTMLAudioElement;
  }
  audioEl = new Audio();
  audioEl.preload = 'none';
  audioEl.crossOrigin = 'anonymous';
  audioEl.addEventListener('ended', () => {
    state = { ...state, isPlaying: false, position: 0 };
    notify();
    // Auto-advance to the next queue entry if one exists. Mirrors
    // Spotify / Apple Music behavior — the user expects continuous
    // listening once a queue is set.
    const idx = state.queue.findIndex((q) => q.id === state.currentId);
    if (idx >= 0 && idx < state.queue.length - 1) {
      const next = state.queue[idx + 1];
      playPreview(next.id, next.url, next.meta);
    }
  });
  audioEl.addEventListener('pause', () => {
    if (audioEl && audioEl.currentTime < (audioEl.duration || Infinity)) {
      state = { ...state, isPlaying: false };
      notify();
    }
  });
  audioEl.addEventListener('timeupdate', () => {
    if (!audioEl) return;
    state = {
      ...state,
      position: audioEl.currentTime || 0,
      duration: audioEl.duration || state.duration || 0,
    };
    notify();
  });
  audioEl.addEventListener('loadedmetadata', () => {
    if (!audioEl) return;
    state = { ...state, duration: audioEl.duration || 0 };
    notify();
  });
  return audioEl;
}

function notify() {
  for (const l of listeners) l(state);
}

/** Play (or restart) a preview by URL. If `id` is already current
 *  and playing, this acts as a toggle (pauses). Optional `meta`
 *  populates the global NowPlayingBar — pass it whenever possible. */
export function playPreview(id: string, url: string, meta?: TrackMeta): void {
  const a = ensureAudio();
  if (state.currentId === id && state.isPlaying) {
    a.pause();
    state = { ...state, isPlaying: false };
    notify();
    return;
  }
  if (state.currentId !== id) {
    a.src = url;
    state = {
      ...state,            // preserve queue
      currentId: id,
      isPlaying: false,
      meta: meta ?? null,
      duration: 0,
      position: 0,
    };
    notify();
  } else if (meta) {
    state = { ...state, meta };
    notify();
  }
  void a.play().then(
    () => {
      state = { ...state, currentId: id, isPlaying: true };
      notify();
    },
    () => {
      // Autoplay blocked or network failure. Reset.
      state = { currentId: null, isPlaying: false, meta: null, duration: 0, position: 0, queue: [] };
      notify();
    },
  );
}

/** Replace the prev/next queue without interrupting current playback.
 *  Called by surfaces that want the bar's nav buttons to work — e.g.
 *  the auto-play effect in App.tsx hands over the building's #1
 *  playlist as a queue right after starting the first track. */
export function setQueue(queue: QueueEntry[]): void {
  state = { ...state, queue };
  notify();
}

/** Skip forward to the next track in the queue. No-op when queue
 *  is empty or current track is the last one (no wrap). */
export function nextTrack(): void {
  const idx = state.queue.findIndex((q) => q.id === state.currentId);
  if (idx < 0 || idx >= state.queue.length - 1) return;
  const next = state.queue[idx + 1];
  playPreview(next.id, next.url, next.meta);
}

/** Step back to the previous track. If the playhead is past the
 *  3-second mark, restart the current track instead (Spotify /
 *  Apple Music convention) so the user can skip back to the start. */
export function prevTrack(): void {
  if (state.position > 3) {
    seekPreview(0);
    return;
  }
  const idx = state.queue.findIndex((q) => q.id === state.currentId);
  if (idx <= 0) {
    seekPreview(0);
    return;
  }
  const prev = state.queue[idx - 1];
  playPreview(prev.id, prev.url, prev.meta);
}

/** Resume the currently-loaded track without reloading its src. Used
 *  by the NowPlayingBar's play button — saves a network round-trip
 *  vs. calling playPreview again. */
export function resumePreview(): void {
  const a = ensureAudio();
  if (!state.currentId) return;
  void a.play().then(() => {
    state = { ...state, isPlaying: true };
    notify();
  });
}

/** Pause without resetting playhead — Space-bar style toggle. */
export function pausePreview(): void {
  const a = ensureAudio();
  a.pause();
  state = { ...state, isPlaying: false };
  notify();
}

/** Stop everything and clear track metadata so the NowPlayingBar
 *  fades out. */
export function stopPreview(): void {
  const a = ensureAudio();
  a.pause();
  a.currentTime = 0;
  // Wipe everything including the queue — close button = full reset.
  state = { currentId: null, isPlaying: false, meta: null, duration: 0, position: 0, queue: [] };
  notify();
}

/** Seek to a time (seconds). Clamped to [0, duration]. */
export function seekPreview(seconds: number): void {
  const a = ensureAudio();
  if (!a.duration) return;
  a.currentTime = Math.max(0, Math.min(a.duration, seconds));
  state = { ...state, position: a.currentTime };
  notify();
}

/** React hook — re-renders the consumer when the player state
 *  changes, so each ▶ button shows ▶ vs ⏸ correctly. */
export function usePlayerState(): PlayerState {
  const [snapshot, setSnapshot] = useState<PlayerState>(state);
  useEffect(() => {
    const l: Listener = (s) => setSnapshot(s);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return snapshot;
}
