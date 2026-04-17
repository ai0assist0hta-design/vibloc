import { useAuthStore } from './useAuthStore';
import { DEFAULT_AVATAR_URL } from './avatar';
import type { AuthUser } from './api';

/** 개발용 어드민 계정 — 로그인/회원가입 없이 즉시 인증 */
export const DEV_ADMIN: AuthUser = {
  id: 'admin-dev-001',
  email: 'admin@vibloc.dev',
  displayName: 'VIBLOC Admin',
  // 기본 프로필 사진을 명시적으로 부여 → 태거 카드/프로필 핀 모두에서 보임
  avatarUrl: DEFAULT_AVATAR_URL,
};

const DEV_TOKEN = 'dev-admin-token';

/** dev 모드에서 어드민 세션 주입 (이미 로그인 상태면 스킵) */
export function seedDevAdmin(): void {
  const { accessToken, setSession } = useAuthStore.getState();
  if (accessToken) return; // 이미 로그인됨
  setSession(DEV_TOKEN, DEV_ADMIN);
}

/** 현재 유저가 dev admin인지 확인 */
export function isDevAdmin(): boolean {
  const { user } = useAuthStore.getState();
  return user?.id === DEV_ADMIN.id;
}
