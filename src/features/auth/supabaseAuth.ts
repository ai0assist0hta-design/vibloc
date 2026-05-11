/**
 * Thin auth API wrapping Supabase for VIBLOC. Replaces the previous
 * self-hosted backend (`POST /auth/login` / `/register` / `/google`)
 * with Supabase Auth's built-in flows. Same async function shapes
 * so call sites in LoginForm / SignupForm / GoogleAuthButton remain
 * minimal-diff.
 *
 * Returns a unified shape: `{ user, session }`. The caller is free
 * to push the session token into useAuthStore — but we also wire a
 * `onAuthStateChange` listener at app boot (see `subscribeAuthSync`)
 * so the store stays in sync with the SDK's own session lifecycle
 * (token refresh, browser tab swap, OAuth callback, etc.).
 */

import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { AuthUser } from './api';
import { useAuthStore } from './useAuthStore';

export type SupabaseAuthResult = { user: User; session: Session };

function ensureConfigured(): void {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY to .env.local and reload.',
    );
  }
}

/** Map a Supabase User → our AuthUser shape (the rest of the app
 *  only knows about AuthUser). `displayName` falls back through:
 *  user_metadata.full_name (Google), .name, then email local-part. */
export function toAuthUser(u: User): AuthUser {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    (u.email ? u.email.split('@')[0] : '') ||
    'User';
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    null;
  return {
    id: u.id,
    email: u.email ?? '',
    displayName,
    avatarUrl,
  };
}

/** Email + password sign-in. */
export async function signInWithEmail(email: string, password: string): Promise<SupabaseAuthResult> {
  ensureConfigured();
  const { data, error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session || !data.user) throw new Error('로그인에 실패했습니다.');
  return { user: data.user, session: data.session };
}

/** Email + password sign-up. `displayName` lands in user_metadata. */
export async function signUpWithEmail(
  email: string, password: string, displayName?: string,
): Promise<SupabaseAuthResult> {
  ensureConfigured();
  const { data, error } = await supabase().auth.signUp({
    email,
    password,
    options: {
      data: displayName ? { full_name: displayName } : undefined,
    },
  });
  if (error) throw error;
  // Email-confirmation flow: data.session may be null until the user
  // clicks the confirmation link. Surface a friendlier error so the
  // UI doesn't render a blank state.
  if (!data.user) throw new Error('회원가입에 실패했습니다.');
  if (!data.session) {
    throw new Error('이메일을 확인하고 인증 링크를 클릭해 주세요.');
  }
  return { user: data.user, session: data.session };
}

/** Google OAuth via Supabase. Redirects the browser to Google,
 *  Supabase handles the callback (set the redirect URL in the
 *  Supabase project's Auth → URL Configuration to your app origin
 *  + `/`, and add Google as a provider with your OAuth credentials).
 *  The page reloads; `subscribeAuthSync` picks up the new session. */
export async function signInWithGoogle(): Promise<void> {
  ensureConfigured();
  const { error } = await supabase().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/map`,
    },
  });
  if (error) throw error;
}

/** Persist a display-name change to Supabase user_metadata so the
 *  server is the source of truth across devices / fresh sign-ins.
 *  Avatar uploads are kept local-only (data URLs blow past
 *  user_metadata's ~4 KB cap). Errors are swallowed so a flaky
 *  network doesn't undo the in-memory change the user just made —
 *  the local store already reflects the new name. */
export async function persistDisplayName(displayName: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await supabase().auth.updateUser({
      data: { full_name: displayName, name: displayName },
    });
  } catch {
    /* network down / signed out — local state stays correct */
  }
}

/** Sign out + clear local store. */
export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    try { await supabase().auth.signOut(); } catch { /* ignore */ }
  }
  useAuthStore.getState().clearSession();
}

/** Wire Supabase's auth state into useAuthStore. Call ONCE at app
 *  boot. Handles: initial session restore on mount, OAuth redirect
 *  callback exchange, token refresh, and remote sign-out. Returns
 *  an unsubscribe function for cleanup (mostly relevant in tests). */
export function subscribeAuthSync(): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const client = supabase();
  // Hydrate immediately from any persisted session.
  void client.auth.getSession().then(({ data }) => {
    if (data.session?.user) {
      useAuthStore.getState().setSession(
        data.session.access_token,
        toAuthUser(data.session.user),
      );
    }
  });
  const { data: sub } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
      useAuthStore.getState().clearSession();
      return;
    }
    useAuthStore.getState().setSession(
      session.access_token,
      toAuthUser(session.user),
    );
  });
  return () => { sub.subscription.unsubscribe(); };
}
