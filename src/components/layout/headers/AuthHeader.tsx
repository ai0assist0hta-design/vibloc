import { Link } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { UserAvatar } from '@/features/auth/UserAvatar';

const mapLinkClass =
  'inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-md border border-[#1a1a2e]/12 bg-white/40 px-3.5 py-2 text-[13px] font-medium leading-none text-[#1a1a2e]/75 backdrop-blur-sm transition-[color,background-color,border-color] hover:border-[#1a1a2e]/20 hover:bg-white/70 hover:text-[#1a1a2e] sm:px-4 sm:text-sm';

/**
 * 인증 라우트 전용 헤더 (`/login`, `/signup`)
 * 마케팅 헤더와 높이·패딩을 맞춰 두었습니다. 디자인 시 이 파일만 수정하면 됩니다.
 */
export function AuthHeader() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const authed = Boolean(accessToken && user);

  return (
    <header className="vibloc-glass-header sticky top-0 z-20 shrink-0">
      <div className="vibloc-header-inner flex h-14 items-center justify-between gap-4 sm:h-16">
        <Link
          to="/"
          className="shrink-0 text-sm font-semibold tracking-[0.2em] text-[#1a1a2e] transition-opacity hover:opacity-80 sm:text-[15px]"
          style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
        >
          ← VIBLOC
        </Link>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {authed && user ? (
            <Link
              to="/mypage"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#1a1a2e]/10 bg-white/35 px-2 py-1.5 text-[13px] font-medium text-[#1a1a2e]/80 backdrop-blur-sm hover:bg-white/60 sm:px-3"
            >
              <UserAvatar user={user} size={26} alt="" />
              <span className="hidden sm:inline">마이페이지</span>
            </Link>
          ) : null}
          <Link to="/map" className={mapLinkClass}>
            맵 둘러보기
          </Link>
        </div>
      </div>
    </header>
  );
}
