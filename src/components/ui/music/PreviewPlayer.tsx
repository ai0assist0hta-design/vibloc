/**
 * Singleton 30s preview player.
 *
 * Why a singleton?
 * ----------------
 * Multiple ▶ buttons may live in the same panel (RecommendedList +
 * future VibeDropFeed). When the user clicks one, ALL other previews
 * must stop instantly so we never have two tracks playing on top of
 * each other. The cleanest way to enforce that is a single shared
 * `<audio>` element managed by a tiny module-level store and exposed
 * via a hook.
 *
 * The audio element is created lazily (so SSR / pre-paint never
 * touches the DOM) and never unmounted — it follows the user across
 * the whole session, which is also what makes "click ▶ on track A,
 * close panel, open another building, ▶ track B" actually work.
 *
 * a11y: keyboard shortcut (Space) is wired in the consumer button so
 * focusable elements stay native and screen readers see real
 * `aria-pressed` state on each track row.
 */

import { useEffect, useState } from 'react';

type Listener = (state: PlayerState) => void;

type PlayerState = {
  /** trackId currently loaded — null when idle. */
  currentId: string | null;
  /** True if `<audio>` is actively playing. */
  isPlaying: boolean;
};

let audioEl: HTMLAudioElement | null = null;
let state: PlayerState = { currentId: null, isPlaying: false };
const listeners = new Set<Listener>();

function ensureAudio(): HTMLAudioElement {
  if (audioEl) return audioEl;
  if (typeof window === 'undefined') {
    // Safety for any future SSR pass — return a no-op object.
    return {} as HTMLAudioElement;
  }
  audioEl = new Audio();
  audioEl.preload = 'none';
  audioEl.crossOrigin = 'anonymous';
  audioEl.addEventListener('ended', () => {
    state = { ...state, isPlaying: false };
    notify();
  });
  audioEl.addEventListener('pause', () => {
    if (audioEl && audioEl.currentTime < (audioEl.duration || Infinity)) {
      state = { ...state, isPlaying: false };
      notify();
    }
  });
  return audioEl;
}

function notify() {
  for (const l of listeners) l(state);
}

/** Play (or restart) a preview by URL. If `id` is already current
 *  and playing, this acts as a toggle (pauses). */
export function playPreview(id: string, url: string): void {
  const a = ensureAudio();
  if (state.currentId === id && state.isPlaying) {
    a.pause();
    state = { currentId: id, isPlaying: false };
    notify();
    return;
  }
  if (state.currentId !== id) {
    a.src = url;
  }
  void a.play().then(
    () => {
      state = { currentId: id, isPlaying: true };
      notify();
    },
    () => {
      // Autoplay blocked or network failure. Reset.
      state = { currentId: null, isPlaying: false };
      notify();
    },
  );
}

/** Stop everything. */
export function stopPreview(): void {
  const a = ensureAudio();
  a.pause();
  a.currentTime = 0;
  state = { currentId: null, isPlaying: false };
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
