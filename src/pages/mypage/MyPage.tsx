import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { UserAvatar } from '@/features/auth/UserAvatar';
import { PH } from '@/content/placeholders';

export function MyPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-sm text-[#1a1a2e]/65">{PH.mypage.needLogin}</p>
        <Link
          to="/login"
          className="rounded-lg bg-[#1a1a2e] px-5 py-2.5 text-sm font-semibold text-[#f8f7f4]"
        >
          로그인
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12 sm:py-16">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <UserAvatar user={user} size={72} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-[#1a1a2e]">
            {user.displayName ?? user.email}
          </h1>
          <p className="mt-1 truncate text-sm text-[#1a1a2e]/55">{user.email}</p>
        </div>
      </div>
      <p className="mt-10 text-sm leading-relaxed text-[#1a1a2e]/50">{PH.mypage.body}</p>
      <div className="mt-10 flex flex-wrap justify-center gap-3 sm:justify-start">
        <Link
          to="/map"
          className="rounded-lg border border-[#1a1a2e]/15 bg-white/60 px-4 py-2 text-sm font-medium text-[#1a1a2e] backdrop-blur-sm"
        >
          맵으로
        </Link>
        <button
          type="button"
          onClick={() => {
            clearSession();
            navigate('/');
          }}
          className="rounded-lg border border-rose-200/80 bg-rose-50/90 px-4 py-2 text-sm font-medium text-rose-900"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
