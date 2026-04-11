import { postJson } from '@/lib/api/client';
import { getApiUrl } from '@/lib/config';

export type AuthUser = {
  id: string;
  email: string;
  displayName?: string;
  /** 업로드·Google 프로필 등. 없으면 프론트에서 기본 아바타 사용 */
  avatarUrl?: string | null;
};

export type AuthTokensResponse = {
  token?: string;
  accessToken?: string;
  user: AuthUser;
};

function base(): string {
  const b = getApiUrl();
  if (!b) throw new Error('VITE_API_URL이 설정되어 있지 않습니다.');
  return b;
}

/** 백엔드가 준비되면 `POST /auth/login` 스키마에 맞게 조정 */
export async function loginRequest(
  email: string,
  password: string,
): Promise<AuthTokensResponse> {
  return postJson<AuthTokensResponse>(`${base()}/auth/login`, { email, password });
}

export async function signupRequest(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthTokensResponse> {
  return postJson<AuthTokensResponse>(`${base()}/auth/register`, {
    email,
    password,
    displayName,
  });
}

export async function googleAuthRequest(idToken: string): Promise<AuthTokensResponse> {
  return postJson<AuthTokensResponse>(`${base()}/auth/google`, { idToken });
}
