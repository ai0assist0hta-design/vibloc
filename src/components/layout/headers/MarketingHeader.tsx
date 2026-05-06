import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { signOut } from '@/features/auth/supabaseAuth';
import { useT } from '@/lib/app/i18n';
import { useDarkModeStore } from '@/lib/app/useDarkMode';

/**
 * Apple-style global nav for marketing routes (`/`, `/mypage`, etc.)
 *
 * Reference: nav.apple.com — 44px tall, 12px regular text, neutral gray
 * with hover to primary, frosted glass background on light pages, pure
 * transparent over the dark hero. Inner container max-width 980 to align
 * exactly with the landing content grid (980).
 */
const fontStack =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Pretendard Variable", "Pretendard", "Inter", sans-serif';

export function MarketingHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const t = useT();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const dark = useDarkModeStore((s) => s.darkMode);
  const toggleDark = useDarkModeStore((s) => s.toggleDarkMode);
  const authed = Boolean(accessToken && user);

  // On landing, header is theme-adaptive: transparent over dark hero,
  // frosted-white once the user scrolls past ~60% of the hero.
  const isLanding = pathname === '/';
  const [scrolledPastHero, setScrolledPastHero] = useState(false);
  useEffect(() => {
    if (!isLanding) {
      setScrolledPastHero(false);
      return;
    }
    const onScroll = () => {
      setScrolledPastHero(window.scrollY > window.innerHeight * 0.6);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isLanding]);

  // Effective dark surface: hero on landing OR user-selected dark
  // mode. Either flips the chrome to the Apple-dark palette so the
  // header reads correctly over whatever sits beneath it.
  const surfaceDark = (isLanding && !scrolledPastHero) || dark;

  // Apple palette
  const C = {
    text: surfaceDark ? 'rgba(245,245,247,0.72)' : 'rgba(29,29,31,0.72)',
    textHover: surfaceDark ? '#f5f5f7' : '#1d1d1f',
    logo: surfaceDark ? '#f5f5f7' : '#1d1d1f',
    // Neutral accent (Apple Blue suppressed). Surface-aware: dark
    // surface → cream pill w/ ink text; light surface → ink pill w/
    // white text. ctaText pairs with blue so hover stays legible.
    blue: surfaceDark ? '#f5f5f7' : '#0e0e1a',
    blueHover: surfaceDark ? '#e0e0e8' : '#2a2a35',
    ctaText: surfaceDark ? '#0e0e1a' : '#ffffff',
    headerBg: (isLanding && !scrolledPastHero)
      ? 'transparent'
      : (dark ? 'rgba(0,0,0,0.72)' : 'rgba(251,251,253,0.72)'),
    border: (isLanding && !scrolledPastHero)
      ? 'transparent'
      : (dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'),
    activeBg: surfaceDark ? 'rgba(255,255,255,0.10)' : 'rgba(29,29,31,0.06)',
  };

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
    transition: 'color 200ms ease, background 200ms ease',
    whiteSpace: 'nowrap',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  };

  const onNavHover = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = C.textHover;
  };
  const onNavLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = C.text;
  };

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: C.headerBg,
        // Frosted glass everywhere except the transparent landing-hero
        // overlap. Both light and dark modes get the same blur — the
        // base color (already encoded in C.headerBg) does the rest.
        backdropFilter: (isLanding && !scrolledPastHero) ? undefined : 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: (isLanding && !scrolledPastHero) ? undefined : 'saturate(180%) blur(20px)',
        borderBottom: `1px solid ${C.border}`,
        transition: 'background 160ms ease, border-color 160ms ease',
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
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
          }}
        >
          <NavLink
            to="/map"
            style={({ isActive }) => ({
              ...navItemBase,
              color: isActive ? C.textHover : C.text,
            })}
            onMouseEnter={onNavHover}
            onMouseLeave={onNavLeave}
          >
            {t('nav.map')}
          </NavLink>

          {authed && user ? (
            <>
              <NavLink
                to="/mypage"
                style={({ isActive }) => ({
                  ...navItemBase,
                  color: isActive ? C.textHover : C.text,
                })}
                onMouseEnter={onNavHover}
                onMouseLeave={onNavLeave}
              >
                {t('nav.mypage')}
              </NavLink>
              <button
                type="button"
                onClick={() => {
                  // signOut() handles both Supabase remote sign-out
                  // (when configured) AND local zustand clear, in
                  // that order. Navigate after to avoid the brief
                  // race where header still shows the user.
                  void signOut().then(() => navigate('/'));
                  clearSession();
                }}
                style={navItemBase}
                onMouseEnter={onNavHover}
                onMouseLeave={onNavLeave}
              >
                {t('nav.logout')}
              </button>
              {/* Dark toggle hidden on the landing route — users can
                  flip themes once they're inside the map. Keeping the
                  marketing nav minimal (Apple practice). */}
              {!isLanding && (
                <DarkToggle dark={dark} onToggle={toggleDark} text={C.text} textHover={C.textHover} />
              )}
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                style={({ isActive }) => ({
                  ...navItemBase,
                  color: isActive ? C.textHover : C.text,
                })}
                onMouseEnter={onNavHover}
                onMouseLeave={onNavLeave}
              >
                {t('nav.login')}
              </NavLink>
              <Link
                to="/signup"
                style={{
                  ...navItemBase,
                  marginLeft: 8,
                  height: 32,
                  padding: '0 16px',
                  borderRadius: 980,
                  background: C.blue,
                  color: C.ctaText,
                  fontWeight: 400,
                  transition: 'background 120ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = C.blueHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = C.blue;
                }}
              >
                {t('nav.signup')}
              </Link>
              {/* Dark toggle hidden on the landing route — users can
                  flip themes once they're inside the map. Keeping the
                  marketing nav minimal (Apple practice). */}
              {!isLanding && (
                <DarkToggle dark={dark} onToggle={toggleDark} text={C.text} textHover={C.textHover} />
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

/** Compact dark/light toggle for the header. Sun in dark mode (next:
 *  light), Moon in light mode (next: dark). 32 px hit area, no fill —
 *  text color follows the surrounding nav for a quiet integration. */
function DarkToggle({
  dark, onToggle, text, textHover,
}: {
  dark: boolean;
  onToggle: () => void;
  text: string;
  textHover: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      style={{
        marginLeft: 4,
        width: 32,
        height: 32,
        borderRadius: 999,
        border: 'none',
        background: 'transparent',
        color: text,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 200ms ease, background 200ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = textHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = text;
      }}
    >
      {dark ? <Sun size={14} strokeWidth={2.2} /> : <Moon size={14} strokeWidth={2.2} />}
    </button>
  );
}
