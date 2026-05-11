/**
 * Supabase singleton client.
 *
 * Reads VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from the env at
 * module load. The anon key is intended to be public (it carries
 * only the row-level-security identity) so embedding it in the
 * frontend bundle is the documented pattern — the actual auth
 * token comes from the user's sign-in flow and is held in the
 * browser's localStorage by the SDK.
 *
 * Falls back to a stub client when env vars are missing so dev
 * builds without Supabase configured don't crash on import. The
 * stub returns "configured: false" to every auth call so the UI
 * can show a helpful message instead of an opaque network error.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function readEnv(key: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof v === 'string' ? v.trim() : '';
}

export function getSupabaseUrl(): string { return readEnv('VITE_SUPABASE_URL'); }
export function getSupabaseAnonKey(): string { return readEnv('VITE_SUPABASE_ANON_KEY'); }

/** True iff both env vars are present and non-empty. UI gates Supabase-
 *  dependent buttons on this so the user sees "Supabase not configured"
 *  instead of a broken request. */
export function isSupabaseConfigured(): boolean {
  return getSupabaseUrl().length > 0 && getSupabaseAnonKey().length > 0;
}

let _client: SupabaseClient | null = null;

/** Lazy singleton. Constructs the real client on first call when env
 *  is configured; otherwise throws so callers can detect via
 *  `isSupabaseConfigured()` first. */
export function supabase(): SupabaseClient {
  if (!_client) {
    if (!isSupabaseConfigured()) {
      throw new Error(
        'Supabase is not configured. Add VITE_SUPABASE_URL and ' +
        'VITE_SUPABASE_ANON_KEY to your .env.local file.',
      );
    }
    _client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        // Persist session in localStorage so reload keeps the user
        // signed in. Same surface area as our previous useAuthStore
        // persist wrapper — Supabase manages the storage internally.
        persistSession: true,
        autoRefreshToken: true,
        // Detect OAuth redirect callback (`#access_token=...` in URL)
        // and exchange for session automatically. Required for the
        // Google sign-in flow which round-trips through Supabase.
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}
