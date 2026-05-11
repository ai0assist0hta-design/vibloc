import { Outlet } from 'react-router-dom';
import { AuthHeader } from '@/components/layout/headers';
import { useDarkMode } from '@/lib/app/useDarkMode';

/**
 * Apple-style auth layout — narrow centered card on Apple's section
 * gray. iCloud/Apple ID sign-in pattern: minimal aside, single
 * focused card. Light + dark variants flip together with the global
 * dark-mode store so signing in stays in the same theme as wherever
 * the user came from.
 */
const fontStack =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Pretendard Variable", "Pretendard", "Inter", sans-serif';

export function AuthLayout() {
  const dark = useDarkMode();
  // One-elevation lift (Apple Settings.app dark): base #1c1c1e,
  // card #2c2c2e — lighter than the original #000 + #1c1c1e pair
  // so the centered sign-in card actually pops against the bg.
  const bg = dark ? '#1c1c1e' : '#f5f5f7';
  const cardBg = dark ? '#2c2c2e' : '#ffffff';
  const text = dark ? '#f5f5f7' : '#1d1d1f';
  const cardShadow = dark
    ? '0 4px 24px rgba(0,0,0,0.40)'
    : '0 4px 16px rgba(0,0,0,0.04)';
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: bg,
        color: text,
        fontFamily: fontStack,
      }}
    >
      <AuthHeader />

      <main
        style={{
          minHeight: 'calc(100dvh - 44px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 22px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 400,
            background: cardBg,
            borderRadius: 18,
            padding: 40,
            boxShadow: cardShadow,
          }}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
