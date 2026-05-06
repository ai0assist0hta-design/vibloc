import { SignupForm } from '@/features/auth/SignupForm';
import { useT } from '@/lib/app/i18n';
import { useDarkMode } from '@/lib/app/useDarkMode';

const fontStack =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Pretendard Variable", "Pretendard", "Inter", sans-serif';

export function SignupPage() {
  const t = useT();
  const dark = useDarkMode();
  const primary = dark ? '#f5f5f7' : '#1d1d1f';
  const secondary = dark ? 'rgba(235,235,245,0.6)' : '#6e6e73';
  return (
    <div style={{ fontFamily: fontStack }}>
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '-0.005em',
          lineHeight: 1.14,
          color: primary,
          margin: 0,
          textAlign: 'center',
        }}
      >
        {t('auth.signup.title')}
      </h1>
      <p
        style={{
          fontSize: 17,
          fontWeight: 400,
          letterSpacing: '-0.022em',
          lineHeight: 1.47,
          color: secondary,
          margin: '8px 0 32px',
          textAlign: 'center',
        }}
      >
        {t('auth.signup.subtitle')}
      </p>
      <SignupForm />
    </div>
  );
}
