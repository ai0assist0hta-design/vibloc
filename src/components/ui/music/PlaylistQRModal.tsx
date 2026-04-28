/**
 * QR-code share modal for a single playlist.
 *
 * Renders a 320 px QR canvas (ECL-H) of a self-contained share URL
 * (`/p#p=<lz-compressed JSON>`). Other devices scan → app opens →
 * preview-render the playlist read-only.
 *
 * Falls back to "Copy link" + a friendly error when the playlist is
 * too large for QR (> 2.4KB compressed).
 */

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
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

const QR_PX = 280;

export function PlaylistQRModal({ buildingId, taggerId, open, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { group, tracks } = useTaggerPlaylist(buildingId, taggerId);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Build the share URL when the modal opens (or the playlist
  // changes). Encoded into URL fragment so privacy is preserved
  // (fragments are never sent to servers).
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

  // Paint QR onto canvas whenever the URL changes.
  useEffect(() => {
    if (!open || !shareUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, shareUrl, {
      errorCorrectionLevel: 'H',
      width: QR_PX,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    }).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`QR render failed: ${msg}`);
    });
  }, [open, shareUrl]);

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share playlist via QR code"
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
          width: 'min(380px, 100%)',
          background: '#f8f7f4',
          borderRadius: 20,
          boxShadow: '0 32px 80px rgba(0,0,0,0.30)',
          padding: '24px 24px 20px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}
      >
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10, fontWeight: 800, letterSpacing: 1.4,
          textTransform: 'uppercase', color: '#6e6e73',
          alignSelf: 'flex-start',
        }}>
          Share Playlist
        </div>
        <div style={{
          fontSize: 17, fontWeight: 800, color: '#1a1a2e',
          letterSpacing: -0.2,
          textAlign: 'center',
          maxWidth: '100%',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={title}>
          {title}
        </div>

        {error ? (
          <div style={{
            padding: 24,
            border: '1px dashed rgba(26,26,46,0.20)',
            borderRadius: 12,
            color: '#a86b00',
            background: 'rgba(245,179,1,0.08)',
            fontSize: 12,
            textAlign: 'center',
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        ) : (
          <div style={{
            padding: 12,
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
          }}>
            <canvas ref={canvasRef} width={QR_PX} height={QR_PX} />
          </div>
        )}

        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10.5, color: '#6e6e73',
          textAlign: 'center', lineHeight: 1.5,
          maxWidth: 280,
        }}>
          Scan with any phone camera —<br/>
          opens the playlist as a read-only preview.
        </div>

        <div style={{
          display: 'flex', gap: 8, width: '100%', marginTop: 4,
        }}>
          <button
            type="button"
            disabled={!shareUrl}
            onClick={async () => {
              if (!shareUrl) return;
              try {
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              } catch { /* ignore — older browsers */ }
            }}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid rgba(26,26,46,0.10)',
              background: '#fff',
              color: '#1a1a2e',
              fontSize: 12, fontWeight: 700,
              cursor: shareUrl ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              letterSpacing: 0.2,
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              background: '#1a1a2e',
              color: '#faf9f6',
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
