import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { UserAvatar } from '@/features/auth/UserAvatar';

/** pill 대신 직선·각진 형태 — 글자 잘림 방지, 우측 정렬 유지 */
const navLink =
  'inline-flex min-h-10 min-w-[3.25rem] shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3.5 py-2 text-[13px] font-medium leading-none tracking-tight text-[#1a1a2e]/68 transition-[color,background-color] hover:bg-[#1a1a2e]/[0.06] hover:text-[#1a1a2e] sm:px-4 sm:text-sm';
const navLinkActive =
  'bg-[#1a1a2e]/[0.09] text-[#1a1a2e] shadow-[inset_0_0_0_1px_rgba(26,26,46,0.12)]';

/**
 * 마케팅 라우트 전용 헤더 (`/`, 푸터 있는 페이지)
 * 스타일 수정 시 이 파일만 보면 됩니다.
 */
export function MarketingHeader() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const authed = Boolean(accessToken && user);

  return (
    <header className="vibloc-glass-header sticky top-0 z-20 shrink-0">
      <div className="vibloc-header-inner flex h-14 items-center justify-between gap-4 sm:h-16">
        <Link
          to="/"
          className="shrink-0 text-[15px] font-semibold tracking-[0.22em] text-[#1a1a2e] sm:text-base"
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
            className={({ isActive }) => `${navLink} ${isActive ? navLinkActive : ''}`}
          >
            맵
          </NavLink>
          {authed && user ? (
            <>
              <NavLink
                to="/mypage"
                className={({ isActive }) =>
                  `${navLink} gap-2 px-2 sm:px-3 ${isActive ? navLinkActive : ''}`
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
                className={`${navLink} text-[#1a1a2e]/55 hover:text-[#1a1a2e]`}
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) => `${navLink} ${isActive ? navLinkActive : ''}`}
              >
                로그인
              </NavLink>
              <Link
                to="/signup"
                className="ml-1 inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-[#1a1a2e] px-4 py-2 text-[13px] font-semibold leading-none tracking-tight text-[#f8f7f4] shadow-sm shadow-[#1a1a2e]/25 transition-[transform,box-shadow] hover:shadow-md hover:shadow-[#1a1a2e]/30 active:scale-[0.98] sm:ml-2 sm:px-5 sm:text-sm"
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
