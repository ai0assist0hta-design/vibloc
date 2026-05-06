import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleAuthButton } from './GoogleAuthButton';
import { signUpWithEmail } from './supabaseAuth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useT } from '@/lib/app/i18n';
import { useDarkMode } from '@/lib/app/useDarkMode';

const C_LIGHT = {
  primary: '#1d1d1f',
  secondary: '#6e6e73',
  blue: '#0e0e1a',
  blueHover: '#2a2a35',
  ctaText: '#ffffff',
  border: 'rgba(0,0,0,0.12)',
  inputBg: '#ffffff',
  surface: '#fbfbfd',
  cardBg: '#ffffff',
  divider: 'rgba(0,0,0,0.10)',
  errorBg: '#fff1f1',
  errorText: '#a8261b',
  errorBorder: '#f7caca',
} as const;
// Same dark stops as LoginForm — see notes there.
const C_DARK = {
  primary: '#f5f5f7',
  secondary: 'rgba(235,235,245,0.65)',
  blue: '#f5f5f7',
  blueHover: '#e0e0e8',
  ctaText: '#0e0e1a',
  border: 'rgba(255,255,255,0.22)',
  inputBg: 'rgba(255,255,255,0.08)',
  surface: 'rgba(255,255,255,0.05)',
  cardBg: '#2c2c2e',
  divider: 'rgba(255,255,255,0.14)',
  errorBg: 'rgba(255,105,97,0.12)',
  errorText: '#ff8b85',
  errorBorder: 'rgba(255,105,97,0.35)',
} as const;
type C = { [K in keyof typeof C_LIGHT]: string };

const T = {
  body: { fontSize: 17, fontWeight: 400, letterSpacing: '-0.022em', lineHeight: 1.47 } as const,
  label: { fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.385 } as const,
  helper: { fontSize: 11, fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.27 } as const,
  caption: { fontSize: 14, fontWeight: 400, letterSpacing: '-0.016em', lineHeight: 1.286 } as const,
} as const;

function inputStyleOf(C: C): React.CSSProperties {
  return {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 12,
    border: `1px solid ${C.border}`,
    background: C.inputBg,
    fontSize: 17,
    fontWeight: 400,
    letterSpacing: '-0.022em',
    lineHeight: 1.47,
    color: C.primary,
    outline: 'none',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };
}
function makeFocusBlur(C: C) {
  return {
    focus: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.borderColor = C.blue;
      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(0,113,227,0.15)';
    },
    blur: (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.borderColor = C.border;
      e.currentTarget.style.boxShadow = 'none';
    },
  };
}

export function SignupForm() {
  const navigate = useNavigate();
  const t = useT();
  const dark = useDarkMode();
  const C: C = dark ? C_DARK : C_LIGHT;
  const inputStyle = inputStyleOf(C);
  const { focus: focusInput, blur: blurInput } = makeFocusBlur(C);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hasGoogle = isSupabaseConfigured();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured()) {
      setError('Supabase가 설정되지 않았습니다. .env.local을 확인해 주세요.');
      return;
    }
    if (password.length < 8) {
      setError(t('auth.error.passwordTooShort'));
      return;
    }
    setLoading(true);
    try {
      // Session sync via App-level onAuthStateChange listener.
      await signUpWithEmail(email.trim(), password, displayName.trim() || undefined);
      navigate('/map');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('auth.error.signupFailed'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {error ? (
        <p
          role="alert"
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 12,
            border: `1px solid ${C.errorBorder}`,
            background: C.errorBg,
            color: C.errorText,
            ...T.caption,
          }}
        >
          {error}
        </p>
      ) : null}

      {hasGoogle ? (
        <GoogleAuthButton onError={setError} />
      ) : (
        <p
          style={{
            padding: '14px 16px',
            borderRadius: 12,
            border: `1px dashed ${C.border}`,
            background: C.surface,
            ...T.caption,
            color: C.secondary,
            textAlign: 'center',
            margin: 0,
          }}
        >
          {t('auth.googleUnsetHint')}
        </p>
      )}

      <div style={{ position: 'relative', margin: '24px 0', textAlign: 'center' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: 1,
            background: C.divider,
          }}
        />
        <span
          style={{
            position: 'relative',
            padding: '0 12px',
            background: C.cardBg,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: C.secondary,
          }}
        >
          {t('auth.divider.or')}
        </span>
      </div>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...T.label, color: C.primary, display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            {t('auth.displayName')}
            <span style={{ ...T.helper, color: C.secondary, fontWeight: 400 }}>{t('auth.optional')}</span>
          </span>
          <input
            type="text"
            autoComplete="nickname"
            value={displayName}
            onChange={(ev) => setDisplayName(ev.target.value)}
            placeholder={t('auth.placeholder.displayName')}
            style={inputStyle}
            onFocus={focusInput}
            onBlur={blurInput}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...T.label, color: C.primary }}>{t('auth.email')}</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
            onFocus={focusInput}
            onBlur={blurInput}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...T.label, color: C.primary, display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            {t('auth.password')}
            <span style={{ ...T.helper, color: C.secondary, fontWeight: 400 }}>{t('auth.passwordHint')}</span>
          </span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            style={inputStyle}
            onFocus={focusInput}
            onBlur={blurInput}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 8,
            padding: '12px 22px',
            borderRadius: 980,
            background: C.blue,
            color: C.ctaText,
            ...T.body,
            lineHeight: 1.176,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'background 120ms ease',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.background = C.blueHover;
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.background = C.blue;
          }}
        >
          {loading ? t('auth.cta.processing') : t('auth.cta.signup')}
        </button>
        <p style={{ marginTop: 8, textAlign: 'center', ...T.caption, color: C.secondary }}>
          {t('auth.footer.haveAccount')}{' '}
          <Link
            to="/login"
            style={{ color: C.blue, textDecoration: 'none', fontWeight: 600 }}
          >
            {t('nav.login')}
          </Link>
        </p>
      </form>
    </div>
  );
}
