import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { UserAvatar } from '@/features/auth/UserAvatar';

/**
 * 마케팅 라우트 전용 헤더 (`/`, `/mypage` 등)
 * 랜딩(`/`)에서는 다크 테마, 나머지는 라이트 테마.
 */
export function MarketingHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const authed = Boolean(accessToken && user);

  // Landing page uses dark theme header
  const isLanding = pathname === '/';
  const textBase = isLanding ? 'text-[#f5f4f1]/60' : 'text-[#1a1a2e]/68';
  const textHover = isLanding ? 'hover:text-[#f5f4f1]' : 'hover:text-[#1a1a2e]';
  const textActive = isLanding
    ? 'bg-white/[0.08] text-[#f5f4f1]'
    : 'bg-[#1a1a2e]/[0.09] text-[#1a1a2e] shadow-[inset_0_0_0_1px_rgba(26,26,46,0.12)]';
  const hoverBg = isLanding ? 'hover:bg-white/[0.06]' : 'hover:bg-[#1a1a2e]/[0.06]';
  const logoColor = isLanding ? 'text-[#f5f4f1]' : 'text-[#1a1a2e]';

  const navLink = `inline-flex min-h-10 min-w-[3.25rem] shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3.5 py-2 text-[13px] font-medium leading-none tracking-tight ${textBase} transition-[color,background-color] ${hoverBg} ${textHover} sm:px-4 sm:text-sm`;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 ${isLanding ? '' : 'vibloc-glass-header'}`}
      style={isLanding ? { background: 'transparent' } : undefined}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-5 sm:h-16">
        <Link
          to="/"
          className={`shrink-0 text-[15px] font-semibold tracking-[0.22em] ${logoColor} sm:text-base`}
          style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
        >
          VIBLOC
        </Link>
        <nav
          className="flex shrink-0 flex-wrap items-center justify-end gap-x-0.5 gap-y-1 sm:gap-x-1"
          aria-label="주요 메뉴"
        >
          <NavLink
            to="/map"
            className={({ isActive }) => `${navLink} ${isActive ? textActive : ''}`}
          >
            맵
          </NavLink>
          {authed && user ? (
            <>
              <NavLink
                to="/mypage"
                className={({ isActive }) =>
                  `${navLink} gap-2 px-2 sm:px-3 ${isActive ? textActive : ''}`
                }
              >
                <UserAvatar user={user} size={28} className="shrink-0" alt="" />
                <span className="max-w-[5.5rem] truncate sm:max-w-none">마이페이지</span>
              </NavLink>
              <button
                type="button"
                onClick={() => {
                  clearSession();
                  navigate('/');
                }}
                className={`${navLink} ${isLanding ? 'text-[#f5f4f1]/40' : 'text-[#1a1a2e]/55'} ${textHover}`}
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) => `${navLink} ${isActive ? textActive : ''}`}
              >
                로그인
              </NavLink>
              <Link
                to="/signup"
                className={`ml-1 inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-[13px] font-semibold leading-none tracking-tight shadow-sm transition-[transform,box-shadow] hover:shadow-md active:scale-[0.98] sm:ml-2 sm:px-5 sm:text-sm ${
                  isLanding
                    ? 'border border-white/[0.12] bg-white/[0.06] text-[#f5f4f1] backdrop-blur-sm hover:bg-white/[0.1]'
                    : 'bg-[#1a1a2e] text-[#f8f7f4] shadow-[#1a1a2e]/25 hover:shadow-[#1a1a2e]/30'
                }`}
              >
                회원가입
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
