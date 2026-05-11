import { Link } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useT } from '@/lib/app/i18n';
import { useDarkModeStore } from '@/lib/app/useDarkMode';

/**
 * Apple-style global nav for auth routes (`/login`, `/signup`).
 * Mirrors MarketingHeader on light pages — same 980 grid, 44px height,
 * frosted glass — so chrome reads as one product.
 */
const fontStack =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Pretendard Variable", "Pretendard", "Inter", sans-serif';

const C_LIGHT = {
  text: 'rgba(29,29,31,0.72)',
  textHover: '#1d1d1f',
  logo: '#1d1d1f',
  // Neutral accent (blue suppressed) — matches landing CTA palette.
  blue: '#0e0e1a',
  blueHover: '#2a2a35',
  headerBg: 'rgba(251,251,253,0.72)',
  border: 'rgba(0,0,0,0.06)',
} as const;
const C_DARK = {
  text: 'rgba(245,245,247,0.72)',
  textHover: '#f5f5f7',
  logo: '#f5f5f7',
  blue: '#f5f5f7',
  blueHover: '#e0e0e8',
  headerBg: 'rgba(0,0,0,0.72)',
  border: 'rgba(255,255,255,0.10)',
} as const;

export function AuthHeader() {
  const t = useT();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const dark = useDarkModeStore((s) => s.darkMode);
  const toggleDark = useDarkModeStore((s) => s.toggleDarkMode);
  const authed = Boolean(accessToken && user);
  const C = dark ? C_DARK : C_LIGHT;

  const navItemBase: React.CSSProperties = {
    fontFamily: fontStack,
    fontSize: 12,
    fontWeight: 400,
    letterSpacing: '-0.01em',
    color: C.text,
    textDecoration: 'none',
    padding: '0 12px',
    height: 44,
    display: 'inline-flex',
    alignItems: 'center',
    transition: 'color 200ms ease',
    whiteSpace: 'nowrap',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  };

  const onHover = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = C.textHover;
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = C.text;
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: C.headerBg,
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          margin: '0 auto',
          maxWidth: 980,
          width: '100%',
          padding: '0 22px',
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <Link
          to="/"
          style={{
            fontFamily: fontStack,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '-0.012em',
            color: C.logo,
            textDecoration: 'none',
            transition: 'opacity 200ms',
            display: 'inline-flex',
            alignItems: 'center',
            height: 44,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          VIBLOC
        </Link>

        <nav
          aria-label={t('nav.menu')}
          style={{ display: 'flex', alignItems: 'center', gap: 0 }}
        >
          {authed ? (
            <Link
              to="/mypage"
              style={navItemBase}
              onMouseEnter={onHover}
              onMouseLeave={onLeave}
            >
              {t('nav.mypage')}
            </Link>
          ) : null}
          <Link
            to="/map"
            style={navItemBase}
            onMouseEnter={onHover}
            onMouseLeave={onLeave}
          >
            {t('nav.map')}
          </Link>
          {/* Dark/light toggle — same icon-only button as the
              MarketingHeader so users can flip themes from any
              auth route without leaving. */}
          <button
            type="button"
            onClick={toggleDark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
            style={{
              marginLeft: 4,
              width: 32,
              height: 32,
              borderRadius: 999,
              border: 'none',
              background: 'transparent',
              color: C.text,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 200ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.textHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.text; }}
          >
            {dark ? <Sun size={14} strokeWidth={2.2} /> : <Moon size={14} strokeWidth={2.2} />}
          </button>
        </nav>
      </div>
    </header>
  );
}
