/**
 * Google OAuth button — routes through Supabase's `signInWithOAuth`.
 * The browser is redirected to Google → Supabase callback → back to
 * `/map` with a session URL fragment that the SDK auto-parses on
 * load (see `lib/supabase.ts` — `detectSessionInUrl: true`).
 *
 * Supabase Dashboard side: Auth → Providers → Google must be
 * enabled with a real OAuth client (any Google Cloud Console
 * client ID + secret pair).
 *
 * No Google Identity Services SDK / popup is needed any more — we
 * dropped `@react-oauth/google`. The button is a plain styled
 * button matching the Apple-style auth form pills.
 */

import { signInWithGoogle } from './supabaseAuth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useDarkMode } from '@/lib/app/useDarkMode';

type Props = {
  onError: (msg: string) => void;
};

export function GoogleAuthButton({ onError }: Props) {
  const dark = useDarkMode();
  if (!isSupabaseConfigured()) return null;

  async function handleClick() {
    try {
      await signInWithGoogle();
      // signInWithGoogle redirects the browser; nothing else to do.
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Google 로그인이 취소되었거나 차단되었습니다.');
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        height: 44,
        padding: '0 16px',
        borderRadius: 980,
        border: `1px solid ${dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)'}`,
        background: dark ? 'rgba(255,255,255,0.06)' : '#ffffff',
        color: dark ? '#f5f5f7' : '#1d1d1f',
        fontSize: 15,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 160ms ease, border-color 160ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = dark
          ? 'rgba(255,255,255,0.10)'
          : '#f5f5f7';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = dark
          ? 'rgba(255,255,255,0.06)'
          : '#ffffff';
      }}
    >
      <GoogleGlyph />
      <span>Continue with Google</span>
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961l3.007 2.332C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
