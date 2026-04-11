import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { googleAuthRequest } from './api';
import { useAuthStore } from './useAuthStore';
import { getApiUrl } from '@/lib/config';
import { ApiError } from '@/lib/api/client';

type Props = {
  onError: (msg: string) => void;
};

export function GoogleAuthButton({ onError }: Props) {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  async function handleSuccess(cr: CredentialResponse) {
    if (!cr.credential) {
      onError('Google에서 토큰을 받지 못했습니다.');
      return;
    }
    if (!getApiUrl()) {
      onError('VITE_API_URL을 설정해 주세요.');
      return;
    }
    try {
      const res = await googleAuthRequest(cr.credential);
      const token = res.accessToken ?? res.token ?? '';
      if (!token) {
        onError('서버 응답에 토큰이 없습니다.');
        return;
      }
      setSession(token, res.user);
      navigate('/map');
    } catch (err) {
      if (err instanceof ApiError) {
        onError(err.message);
      } else if (err instanceof Error) {
        onError(err.message);
      } else {
        onError('Google 로그인 요청에 실패했습니다.');
      }
    }
  }

  return (
    <div className="flex w-full justify-center [&>div]:w-full [&>div>div]:w-full">
      <GoogleLogin
        onSuccess={(c) => void handleSuccess(c)}
        onError={() => onError('Google 로그인이 취소되었거나 차단되었습니다.')}
        useOneTap={false}
        theme="outline"
        size="large"
        text="continue_with"
        shape="rectangular"
        width="100%"
      />
    </div>
  );
}
