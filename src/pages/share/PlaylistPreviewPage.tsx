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
import { AlertCircle, ArrowLeft, ExternalLink, Music2, Share2 } from 'lucide-react';
import {
  appleMusicUrl,
  decodePlaylistFromHash,
  type SharedPlaylist,
  type SharedTrack,
} from '../../lib/share/playlistShareUrl';
import { isIOS, isInAppBrowser, openAppleMusic } from '../../lib/share/openAppleMusic';
import {
  APPLE_RED, INK, PAPER, MUTED, DIVIDER,
} from '../../lib/ui/tokens';

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
            fontFamily: "'IBM Plex Mono', monospace",
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
          fontFamily: "'IBM Plex Mono', monospace",
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
              color: MUTED, fontFamily: "'IBM Plex Mono', monospace",
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
          fontFamily: "'IBM Plex Mono', monospace",
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
          <div>
            인앱 브라우저에서 열려 Apple Music 앱이 안 뜰 수 있어요.
            우상단 <strong>⋯ → Safari/Chrome으로 열기</strong>를 한 번 눌러주세요.
          </div>
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

      {/* Footer note */}
      <footer style={{
        marginTop: 36,
        padding: '0 20px',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10.5, color: MUTED, lineHeight: 1.6,
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
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(26,26,46,0.05)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        flexShrink: 0, width: 22, textAlign: 'right',
        fontFamily: "'IBM Plex Mono', monospace",
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

      <span
        aria-label="Open in Apple Music"
        style={{
          flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 10px', borderRadius: 999,
          background: APPLE_RED, color: '#fff',
          fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        <Music2 size={12} strokeWidth={2.4} />
        Apple Music
        <ExternalLink size={10} strokeWidth={2.4} style={{ opacity: 0.85 }} />
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
      fontFamily: "'IBM Plex Mono', monospace",
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
        fontFamily: "'IBM Plex Mono', monospace",
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
