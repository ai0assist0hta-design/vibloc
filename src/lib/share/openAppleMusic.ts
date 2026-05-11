/**
 * Cross-platform "open this track in Apple Music" helper.
 *
 * Why this isn't a one-liner:
 * - iOS Safari handles `https://music.apple.com/…` as a Universal
 *   Link and usually opens the app, but inside Safari View Controller
 *   or any in-app webview (KakaoTalk, Instagram, Threads, Line) the
 *   link gets intercepted and shown inside the host app's webview as
 *   a web player. Using `music://` forces the system to hand the URL
 *   straight to the Apple Music app and bypass that capture.
 * - macOS treats `music://` the same way (jumps to Music.app).
 * - Android, desktop browsers, anything else: `music://` doesn't
 *   resolve, so we fall through to the regular https URL in a new
 *   tab. That's the safe default for everywhere we don't know.
 *
 * Both call sites (the shared-link preview page and the in-app
 * playlist detail view) want the same behavior, so the logic lives
 * here and stays in sync.
 */

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS reports as Macintosh — disambiguate with touch support.
  if (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document) return true;
  return false;
}

export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /KAKAOTALK|FBAN|FBAV|Instagram|Line|NAVER|DaumApps|wv\)|Twitter|Threads/i.test(navigator.userAgent);
}

/** Convert a music.apple.com https URL into the `music://` variant.
 *  Returns the input unchanged if it doesn't match. */
export function toAppScheme(url: string): string {
  return url.replace(/^https?:\/\/music\.apple\.com/, 'music://music.apple.com');
}

/** Open a music.apple.com URL with the platform-appropriate strategy.
 *  On iOS: try `music://` first, fall back to https in a new tab if
 *  the app didn't grab focus within ~800 ms (e.g. Apple Music
 *  uninstalled). Everywhere else: just open https in a new tab. */
export function openAppleMusic(httpsUrl: string): void {
  if (typeof window === 'undefined') return;
  if (!isIOS()) {
    window.open(httpsUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  const appUrl = toAppScheme(httpsUrl);
  const t0 = Date.now();
  const fallback = window.setTimeout(() => {
    if (Date.now() - t0 < 1500) {
      window.open(httpsUrl, '_blank', 'noopener,noreferrer');
    }
  }, 800);
  // pagehide fires when the OS hands the user off to another app —
  // that's our signal that the app scheme worked, so cancel fallback.
  window.addEventListener('pagehide', () => clearTimeout(fallback), { once: true });
  window.location.href = appUrl;
}
