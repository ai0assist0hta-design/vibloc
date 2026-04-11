/** 업로드 전까지 공통 기본 프로필 (나중에 교체 가능) */
export const DEFAULT_AVATAR_URL = '/avatars/default.svg';

export function resolveAvatarUrl(avatarUrl: string | null | undefined): string {
  if (typeof avatarUrl === 'string' && avatarUrl.trim().length > 0) {
    return avatarUrl.trim();
  }
  return DEFAULT_AVATAR_URL;
}
