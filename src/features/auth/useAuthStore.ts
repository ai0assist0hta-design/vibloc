import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AuthUser } from './api';

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
  /** Patch fields on the currently signed-in user — used by MyPage
   *  for inline name edits and local avatar uploads. No-op if there
   *  is no active user. */
  updateUser: (patch: Partial<AuthUser>) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setSession: (accessToken, user) => set({ accessToken, user }),
      clearSession: () => set({ accessToken: null, user: null }),
      updateUser: (patch) =>
        set((s) => (s.user ? { user: { ...s.user, ...patch } } : {})),
    }),
    {
      name: 'vibloc-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ accessToken: s.accessToken, user: s.user }),
    },
  ),
);

// Cross-tab live sync — zustand's `persist` middleware writes to
// localStorage but does NOT auto-listen to `storage` events. So an
// avatar / display-name change in tab A wouldn't show up in tab B
// until the user reloaded. Re-hydrating on every same-key `storage`
// event closes that gap so the My Page upload immediately propagates
// to every other open tab (right-rail ProfileRow, MY PLAYLIST card,
// nav bar, etc.).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'vibloc-auth') {
      void useAuthStore.persist.rehydrate();
    }
  });
}
