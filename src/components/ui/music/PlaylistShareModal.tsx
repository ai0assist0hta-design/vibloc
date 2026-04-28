/**
 * URL-based share modal for a single playlist.
 *
 * Replaces the old QR modal with a "copy link / native share" UX —
 * the share URL is the same self-contained `/p#p=<lz-compressed JSON>`
 * fragment, but the user picks the destination (clipboard, native
 * share sheet, AirDrop, KakaoTalk, iMessage, etc.) instead of having
 * to scan a code with a second device.
 *
 * Web Share API is used when present (mobile browsers + recent
 * desktop Safari/Chrome) — that's the one-tap path to AirDrop /
 * Messages / Slack / KakaoTalk.
 *
 * Falls back to a friendly error when the playlist is too large to
 * encode (>2.4 KB compressed).
 */

import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Share2, Link2 } from 'lucide-react';
import {
  encodePlaylistUrl,
  toSharedTracks,
  type SharedPlaylist,
} from '../../../lib/share/playlistShareUrl';
import {
  useTaggerPlaylist,
  getTaggerPlaylistName,
} from '../../../lib/music/buildingPlaylist';

type Props = {
  buildingId: string;
  taggerId: string;
  open: boolean;
  onClose: () => void;
};

export function PlaylistShareModal({ buildingId, taggerId, open, onClose }: Props) {
  const { group, tracks } = useTaggerPlaylist(buildingId, taggerId);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Detect Web Share API once — used to decide whether to surface the
  // "Share…" primary CTA. Falls back to Copy Link on desktop where
  // the API is missing or only supports files (not URLs).
  const canNativeShare = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    if (typeof navigator.share !== 'function') return false;
    // Some desktop Chrome versions ship the API but reject URL-only
    // payloads — guard with canShare when available.
    if (typeof navigator.canShare === 'function') {
      try { return navigator.canShare({ url: 'https://example.com' }); }
      catch { return false; }
    }
    return true;
  }, []);

  // Build the share URL when the modal opens (or the playlist
  // changes). Encoded into URL fragment so privacy is preserved
  // (fragments never reach servers / referrer headers).
  useEffect(() => {
    if (!open || !group) return;
    setError(null);
    setCopied(false);
    const customName = getTaggerPlaylistName(buildingId, taggerId);
    const payload: SharedPlaylist = {
      v: 1,
      b: buildingId,
      t: taggerId,
      n: customName || group.taggerName,
      tn: group.taggerName,
      tracks: toSharedTracks(tracks),
    };
    const base = typeof window !== 'undefined'
      ? `${window.location.origin}`
      : 'https://vibloc.app';
    try {
      const url = encodePlaylistUrl(base, payload);
      setShareUrl(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setShareUrl(null);
      setError(msg);
    }
  }, [open, buildingId, taggerId, group, tracks]);

  // Body scroll lock + ESC close.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const title = group
    ? (getTaggerPlaylistName(buildingId, taggerId) || group.taggerName)
    : 'Playlist';

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore — older browsers */ }
  }

  async function handleNativeShare() {
    if (!shareUrl) return;
    try {
      await navigator.share({
        title: `VIBLOC — ${title}`,
        text: `${tracks.length}곡 큐레이션 · ${group?.taggerName ?? ''}`.trim(),
        url: shareUrl,
      });
    } catch {
      // User cancelled or share failed — silently fall back to copy.
      handleCopy();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share playlist link"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(15,15,20,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        fontFamily: "'Inter', 'Pretendard', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          background: '#f8f7f4',
          borderRadius: 20,
          boxShadow: '0 32px 80px rgba(0,0,0,0.30)',
          padding: '24px 24px 20px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10, fontWeight: 800, letterSpacing: 1.4,
          textTransform: 'uppercase', color: '#6e6e73',
        }}>
          Share Playlist
        </div>
        <div style={{
          fontSize: 18, fontWeight: 800, color: '#1a1a2e',
          letterSpacing: -0.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={title}>
          {title}
        </div>

        {error ? (
          <div style={{
            padding: 16,
            border: '1px dashed rgba(26,26,46,0.20)',
            borderRadius: 12,
            color: '#a86b00',
            background: 'rgba(245,179,1,0.08)',
            fontSize: 12,
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        ) : (
          <>
            {/* URL preview — read-only, monospaced, single-line, scrolls
                horizontally on overflow so the user can spot-check */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px',
              background: '#fff',
              borderRadius: 10,
              border: '1px solid rgba(26,26,46,0.10)',
            }}>
              <Link2 size={14} color="#6e6e73" strokeWidth={2} style={{ flexShrink: 0 }} />
              <input
                type="text"
                readOnly
                value={shareUrl ?? ''}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  flex: 1, minWidth: 0,
                  border: 'none', outline: 'none',
                  background: 'transparent',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11, color: '#1a1a2e',
                  letterSpacing: 0,
                }}
              />
            </div>

            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10.5, color: '#6e6e73',
              lineHeight: 1.5,
            }}>
              {tracks.length} track{tracks.length === 1 ? '' : 's'} · self-contained link.
              Paste anywhere — recipient opens a read-only preview.
            </div>
          </>
        )}

        <div style={{
          display: 'flex', gap: 8, marginTop: 4,
        }}>
          {canNativeShare && (
            <button
              type="button"
              disabled={!shareUrl}
              onClick={handleNativeShare}
              style={{
                flex: 1,
                padding: '11px 14px',
                borderRadius: 10,
                border: 'none',
                background: '#1a1a2e',
                color: '#faf9f6',
                fontSize: 12, fontWeight: 700,
                cursor: shareUrl ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                letterSpacing: 0.2,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Share2 size={14} strokeWidth={2.2} />
              Share…
            </button>
          )}
          <button
            type="button"
            disabled={!shareUrl}
            onClick={handleCopy}
            style={{
              flex: 1,
              padding: '11px 14px',
              borderRadius: 10,
              border: canNativeShare ? '1px solid rgba(26,26,46,0.10)' : 'none',
              background: canNativeShare ? '#fff' : '#1a1a2e',
              color: canNativeShare ? '#1a1a2e' : '#faf9f6',
              fontSize: 12, fontWeight: 700,
              cursor: shareUrl ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              letterSpacing: 0.2,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {copied
              ? (<><Check size={14} strokeWidth={2.4} /> Copied</>)
              : (<><Copy size={14} strokeWidth={2.2} /> Copy link</>)}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '11px 14px',
              borderRadius: 10,
              border: '1px solid rgba(26,26,46,0.10)',
              background: 'transparent',
              color: '#6e6e73',
              fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: 0.2,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
