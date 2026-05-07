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
      setSession: (accessToken, user) => set((s) => {
        // Supabase's `onAuthStateChange` fires on token refresh /
        // window focus / re-hydration and calls setSession with the
        // server-authoritative user record — which has NO knowledge
        // of the avatar PNGs and inline name edits the user made via
        // `updateUser` (those live only in localStorage). Without
        // this guard, every refresh would wipe those local edits a
        // few seconds after they were applied — exactly the
        // "마이페이지에서 사진/이름 바꿔도 적용 안된다" bug.
        //
        // When the incoming user has the SAME id as the current one,
        // preserve the locally-edited fields. New sign-in (different
        // id) or signed-out → in flow falls through to the plain
        // overwrite so a fresh user starts with their server profile.
        if (s.user && s.user.id === user.id) {
          return {
            accessToken,
            user: {
              ...user,
              displayName: s.user.displayName ?? user.displayName,
              avatarUrl: s.user.avatarUrl !== undefined ? s.user.avatarUrl : user.avatarUrl,
            },
          };
        }
        return { accessToken, user };
      }),
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
