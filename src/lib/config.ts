/**
 * API base URL (no trailing slash). Empty string if unset — auth UI shows a hint.
 */
export function getApiUrl(): string {
  const raw = import.meta.env.VITE_API_URL;
  if (typeof raw !== 'string' || !raw.trim()) return '';
  return raw.replace(/\/$/, '');
}

/** Google Identity Services (OAuth 웹 클라이언트 ID). 백엔드 `GOOGLE_CLIENT_ID`와 동일한 값. */
export function getGoogleClientId(): string {
  const raw = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (typeof raw !== 'string' || !raw.trim()) return '';
  return raw.trim();
}
