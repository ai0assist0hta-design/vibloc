/**
 * Global dark-mode store. Persists to localStorage so the user's
 * choice survives reloads AND propagates across every route (map,
 * landing, mypage, auth, playlist detail) — once set, every Apple-
 * palette surface flips together until the user turns it back off.
 *
 * Why a homegrown 30-line store instead of next-themes / mantine /
 * etc.: same rationale as the i18n module — < 50 lines, 1 setting,
 * zero new deps. Synchronously hydrates from localStorage so the
 * first paint is already on the right side (no light → dark flash).
 */

import { create } from 'zustand';

const STORAGE_KEY = 'vibloc.darkMode';

function loadInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
  } catch {
    // localStorage may be disabled (Safari private mode).
  }
  // No saved preference yet — fall back to the OS prefers-color-scheme
  // signal. Apple's dark-mode standard: respect the system unless the
  // user has explicitly opted in/out.
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

type DarkModeStore = {
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  toggleDarkMode: () => void;
};

export const useDarkModeStore = create<DarkModeStore>((set, get) => ({
  darkMode: loadInitial(),
  setDarkMode: (v) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
      }
    } catch {
      // ignore
    }
    set({ darkMode: v });
  },
  toggleDarkMode: () => get().setDarkMode(!get().darkMode),
}));

// Cross-tab live sync — toggling dark mode in tab A immediately
// flips every other open tab to the same palette, no refresh needed.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || e.newValue == null) return;
    const next = e.newValue === '1' || e.newValue === 'true';
    if (useDarkModeStore.getState().darkMode !== next) {
      useDarkModeStore.setState({ darkMode: next });
    }
  });
}

/** Convenience hook — returns just the boolean for components that
 *  only need to read. Equivalent to `useDarkModeStore(s => s.darkMode)`. */
export function useDarkMode(): boolean {
  return useDarkModeStore((s) => s.darkMode);
}
