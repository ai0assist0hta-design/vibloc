/**
 * `/p` route — read-only preview of a shared playlist.
 *
 * The full playlist (curator + tracks + artwork URLs) lives inside
 * `location.hash` as a LZString-compressed JSON blob. No network
 * call, no backend, no localStorage write. The receiver just sees
 * the deck and can tap "Open in Apple Music" per track — every
 * track carries either an iTunes-API `trackViewUrl` (best) or
 * falls back to the universal `music.apple.com/song/{id}` form,
 * both of which open the Apple Music app on iOS / macOS and the
 * web player elsewhere.
 *
 * This is the "Option A" Apple Music path: no MusicKit, no API
 * keys, no curator program — every link is a public Apple Music
 * deep link the user can tap one-by-one (and then "+ Library"
 * inside the Apple Music app itself).
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Share2 } from 'lucide-react';
import {
  appleMusicUrl,
  decodePlaylistFromHash,
  type SharedPlaylist,
  type SharedTrack,
} from '../../lib/share/playlistShareUrl';
import { isIOS, isInAppBrowser, openAppleMusic } from '../../lib/share/openAppleMusic';
import {
  INK, PAPER, MUTED, DIVIDER,
} from '../../lib/ui/tokens';
import { useT } from '../../lib/app/i18n';

export function PlaylistPreviewPage() {
  // Decode once on mount, then stay stable. Hash mutations after
  // mount are unusual for a share link, so we don't subscribe.
  const [data, setData] = useState<SharedPlaylist | null | 'pending'>('pending');
  useEffect(() => {
    setData(decodePlaylistFromHash(window.location.hash));
  }, []);

  if (data === 'pending') return <BootSplash />;
  if (!data) return <InvalidLink />;
  return <Preview playlist={data} />;
}

// ─── Preview ─────────────────────────────────────────────────────────

function Preview({ playlist }: { playlist: SharedPlaylist }) {
  const t = useT();
  const cover = useMemo(() => {
    // Top track's artwork = cover. Mirrors the in-app pattern.
    return playlist.tracks.find((t) => t.art)?.art ?? null;
  }, [playlist]);

  const totalSec = playlist.tracks.length * 200;

  // Detect once per mount. SSR-safe.
  const ios = useMemo(() => isIOS(), []);
  const inApp = useMemo(() => isInAppBrowser(), []);

  async function handleShare() {
    const url = window.location.href;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `VIBLOC — ${playlist.n}`,
          text: `${playlist.tracks.length}곡 큐레이션 · ${playlist.tn}`,
          url,
        });
        return;
      } catch { /* fall through to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch { /* very old browser — give up silently */ }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: PAPER,
      color: INK,
      fontFamily: "'Inter', 'Pretendard', system-ui, sans-serif",
      paddingBottom: 80,
    }}>
      {/* Top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px',
        background: 'rgba(250,249,246,0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${DIVIDER}`,
      }}>
        <Link
          to="/"
          aria-label="Go to VIBLOC"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            textDecoration: 'none', color: INK,
            fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
            fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          VIBLOC
        </Link>
        <button
          type="button"
          onClick={handleShare}
          aria-label="Share this link"
          style={{
            marginLeft: 'auto',
            padding: '8px 12px', borderRadius: 8,
            border: `1px solid ${DIVIDER}`,
            background: '#fff',
            color: INK,
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Share2 size={13} strokeWidth={2.2} /> Share
        </button>
      </header>

      {/* Hero */}
      <section style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 14, padding: '32px 20px 20px',
      }}>
        <div style={{
          fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
          fontSize: 10, fontWeight: 800, letterSpacing: 1.6,
          textTransform: 'uppercase', color: MUTED,
        }}>
          Shared Playlist · Read-only Preview
        </div>
        <div style={{
          width: 200, height: 200, borderRadius: 18,
          overflow: 'hidden',
          border: `1px solid ${DIVIDER}`,
          boxShadow: '0 18px 48px rgba(0,0,0,0.18)',
          background: '#eee',
        }}>
          {cover ? (
            <img
              src={cover}
              alt={playlist.n}
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: MUTED, fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
              fontSize: 48, fontWeight: 700,
            }}>
              {(playlist.n.trim().charAt(0) || '?').toUpperCase()}
            </div>
          )}
        </div>

        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 800,
          letterSpacing: -0.3, lineHeight: 1.2,
          textAlign: 'center', maxWidth: 320,
        }} title={playlist.n}>
          {playlist.n}
        </h1>
        <div style={{
          fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
          fontSize: 11, fontWeight: 600, color: MUTED,
          letterSpacing: 0.4,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>{playlist.tn}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{playlist.tracks.length} track{playlist.tracks.length === 1 ? '' : 's'}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{fmtMinutes(totalSec)}</span>
        </div>
      </section>

      {/* In-app browser hint — KakaoTalk / Instagram / Threads webviews
          swallow Apple Music universal links. Tell the user once. */}
      {inApp && (
        <div style={{
          margin: '12px auto 0', maxWidth: 560,
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 14px',
          background: 'rgba(245,179,1,0.10)',
          border: '1px solid rgba(245,179,1,0.40)',
          borderRadius: 12,
          fontSize: 12, lineHeight: 1.5, color: '#7a4f00',
        }}>
          <AlertCircle size={16} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>{t('preview.inAppWarning')}</div>
        </div>
      )}

      {/* Track list */}
      <ol style={{
        listStyle: 'none', margin: '8px 0 0', padding: '0 12px',
        display: 'flex', flexDirection: 'column', gap: 4,
        maxWidth: 640, marginLeft: 'auto', marginRight: 'auto',
      }}>
        {playlist.tracks.map((t, i) => (
          <li key={`${t.i}-${i}`}>
            <TrackRow t={t} idx={i + 1} ios={ios} />
          </li>
        ))}
      </ol>

      {/* Bottom CTA — bridges the share recipient into VIBLOC's
          signup. Without this card, /p was a one-way exit (every
          tap left for Apple Music, no path back into the product).
          Card style mirrors Apple Music's "Sign up for Apple Music"
          interstitial: friendly headline, soft body, single high-
          contrast CTA. */}
      <div style={{
        marginTop: 32,
        marginLeft: 'auto', marginRight: 'auto',
        maxWidth: 480,
        padding: '20px 22px',
        borderRadius: 16,
        border: `1px solid ${DIVIDER}`,
        background: 'rgba(14,14,26,0.025)',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 16, fontWeight: 700, color: INK,
          letterSpacing: '-0.011em', lineHeight: 1.3,
        }}>
          {t('preview.tryVibloc.title')}
        </div>
        <div style={{
          marginTop: 6,
          fontSize: 13, color: MUTED, lineHeight: 1.5,
          letterSpacing: '-0.01em',
        }}>
          {t('preview.tryVibloc.body')}
        </div>
        <Link
          to="/signup"
          style={{
            display: 'inline-block',
            marginTop: 14,
            padding: '10px 20px',
            borderRadius: 999,
            background: INK, color: PAPER,
            fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
            textDecoration: 'none',
          }}
        >
          {t('preview.tryVibloc.cta')}
        </Link>
      </div>

      {/* Footer note */}
      <footer style={{
        marginTop: 24,
        padding: '0 20px',
        fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
        fontSize: 11, color: MUTED, lineHeight: 1.6,
        textAlign: 'center', maxWidth: 480,
        marginLeft: 'auto', marginRight: 'auto',
      }}>
        Tap any track to open it in Apple Music.<br />
        From there, hit <strong style={{ color: INK }}>+</strong> to save it to your library.
        <br /><br />
        <Link to="/map" style={{ color: INK, fontWeight: 700, letterSpacing: 0.4 }}>
          Explore VIBLOC →
        </Link>
      </footer>
    </div>
  );
}

function TrackRow({ t, idx, ios }: { t: SharedTrack; idx: number; ios: boolean }) {
  const httpsUrl = appleMusicUrl(t);
  // On iOS we *prefer* the music:// scheme so the Apple Music app
  // opens directly even from inside Safari or any in-app webview.
  // The shared `openAppleMusic` helper handles the timeout fallback
  // to the https URL when the app isn't installed.
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!ios) return; // let the browser follow the https href
    e.preventDefault();
    openAppleMusic(httpsUrl);
  }
  return (
    <a
      href={httpsUrl}
      target="_blank"
      rel="noreferrer"
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 10px', borderRadius: 10,
        textDecoration: 'none', color: INK,
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(14,14,26,0.05)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        flexShrink: 0, width: 22, textAlign: 'right',
        fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
        fontSize: 11, color: MUTED, fontVariantNumeric: 'tabular-nums',
      }}>{idx}</span>

      <div style={{
        flexShrink: 0, width: 40, height: 40, borderRadius: 6,
        overflow: 'hidden', background: '#eee',
        border: `1px solid ${DIVIDER}`,
      }}>
        {t.art ? (
          <img
            src={t.art}
            alt=""
            loading="lazy" decoding="async" referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, letterSpacing: -0.1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={t.n}>{t.n}</div>
        <div style={{
          fontSize: 11, color: MUTED, marginTop: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={t.a}>{t.a}</div>
      </div>

      {/* Same compact app-icon as TrackRow / NowPlayingBar — gradient
          + beamed-note glyph matching the actual Apple Music icon.
          The parent <a> handles navigation; this is the affordance. */}
      <span
        aria-label="Open in Apple Music"
        style={{
          flexShrink: 0,
          width: 24, height: 24,
          borderRadius: 6,
          background: 'linear-gradient(180deg, #FB5C74 0%, #FA243C 100%)',
          color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 32 32" aria-hidden="true">
          <path fill="#fff" d="M11.5 6.6 C11.5 5.8 12 5.2 12.8 5 L23.6 2.6 C24.4 2.4 25 3 25 3.8 L25 19.5 C25 21.5 23.5 23 21.5 23 C19.5 23 18 21.5 18 19.5 C18 17.5 19.5 16 21.5 16 C22.1 16 22.6 16.1 23 16.4 L23 9 L13.5 11 L13.5 22.5 C13.5 24.5 12 26 10 26 C8 26 6.5 24.5 6.5 22.5 C6.5 20.5 8 19 10 19 C10.6 19 11.1 19.1 11.5 19.4 Z" />
        </svg>
      </span>
    </a>
  );
}

// ─── States ──────────────────────────────────────────────────────────

function BootSplash() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: PAPER, color: MUTED,
      fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
      fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase',
    }}>
      Decoding playlist…
    </div>
  );
}

function InvalidLink() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: PAPER, color: INK, padding: 24,
      fontFamily: "'Inter', 'Pretendard', system-ui, sans-serif",
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
        fontSize: 11, color: MUTED, letterSpacing: 1.4,
        textTransform: 'uppercase',
      }}>
        Invalid or expired link
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 320, color: MUTED }}>
        This share link doesn't contain a readable playlist.
        It may have been edited, truncated, or copied incompletely.
      </div>
      <Link
        to="/"
        style={{
          marginTop: 8, padding: '10px 16px', borderRadius: 10,
          background: INK, color: PAPER, textDecoration: 'none',
          fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
        }}
      >
        Go to VIBLOC
      </Link>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function fmtMinutes(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}
