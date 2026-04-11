import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signupRequest } from './api';
import { GoogleAuthButton } from './GoogleAuthButton';
import { useAuthStore } from './useAuthStore';
import { getApiUrl, getGoogleClientId } from '@/lib/config';
import { ApiError } from '@/lib/api/client';
import { PH } from '@/content/placeholders';

const inputClass =
  'w-full rounded-xl border border-[#1a1a2e]/12 bg-white/90 px-3.5 py-3 text-[#1a1a2e] outline-none transition-shadow placeholder:text-[#1a1a2e]/35 focus:border-[#1a1a2e]/35 focus:ring-2 focus:ring-[#1a1a2e]/10';

export function SignupForm() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hasGoogle = Boolean(getGoogleClientId());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!getApiUrl()) {
      setError('`.env.local`에 VITE_API_URL을 넣고 프론트를 다시 실행해 주세요.');
      return;
    }
    if (password.length < 8) {
      setError('비밀번호는 8자 이상으로 해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const res = await signupRequest(
        email.trim(),
        password,
        displayName.trim() || undefined,
      );
      const token = res.accessToken ?? res.token ?? '';
      if (!token) {
        setError('서버 응답에 토큰이 없습니다. API 스키마를 확인해 주세요.');
        return;
      }
      setSession(token, res.user);
      navigate('/map');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 404
            ? '회원가입 API를 찾을 수 없습니다. 백엔드를 실행했는지 확인해 주세요.'
            : err.message,
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('회원가입에 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-0">
      {error ? (
        <p
          className="mb-5 rounded-xl border border-rose-200/80 bg-rose-50/95 px-3.5 py-2.5 text-sm text-rose-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {hasGoogle ? (
        <GoogleAuthButton onError={setError} />
      ) : (
        <p className="rounded-xl border border-dashed border-[#1a1a2e]/14 bg-[#1a1a2e]/[0.03] px-3 py-3 text-center text-[12px] leading-relaxed text-[#48484a]">
          {PH.authForm.googleUnsetHint}
        </p>
      )}

      <div className="relative my-7">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-[#1a1a2e]/10" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-[rgba(255,255,255,0.92)] px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6e6e73]">
            {PH.authForm.dividerSignup}
          </span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-left text-[13px] font-semibold text-[#1a1a2e]">
          표시 이름 <span className="text-[11px] font-normal text-[#6e6e73]">(선택)</span>
          <input
            type="text"
            autoComplete="nickname"
            value={displayName}
            onChange={(ev) => setDisplayName(ev.target.value)}
            className={inputClass}
            placeholder="맵에서 보일 이름"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-left text-[13px] font-semibold text-[#1a1a2e]">
          이메일
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            className={inputClass}
            placeholder="you@example.com"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-left text-[13px] font-semibold text-[#1a1a2e]">
          비밀번호 <span className="text-[11px] font-normal text-[#6e6e73]">(8자 이상)</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="mt-1 rounded-xl bg-[#1a1a2e] px-4 py-3.5 text-sm font-semibold text-[#faf9f6] shadow-md shadow-[#1a1a2e]/15 transition-opacity disabled:opacity-50"
        >
          {loading ? '처리 중…' : '이메일로 가입하기'}
        </button>
        <p className="pt-1 text-center text-[12px] text-[#48484a]">
          이미 계정이 있나요?{' '}
          <Link to="/login" className="font-semibold text-[#1a1a2e] underline-offset-2 hover:underline">
            로그인
          </Link>
        </p>
      </form>
    </div>
  );
}
