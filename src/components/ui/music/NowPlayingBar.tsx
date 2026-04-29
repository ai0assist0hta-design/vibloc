/**
 * Global "now playing" bar — fixed bottom-center of the viewport.
 *
 * Hidden until the user actually plays a preview, then fades in
 * (200 ms). Reads PreviewPlayer's singleton state directly so it
 * stays in sync no matter which surface (TrackRow, PlaylistDetail
 * Play / Shuffle, FeaturedHero, share preview, …) triggered the
 * playback.
 *
 * Scope intentionally minimal — VIBLOC plays 30 s iTunes previews
 * one at a time, with no queue, no algorithmic shuffle, no
 * scrubbing across tracks, no AirPlay. The macOS Music bar's
 * shuffle / prev / next / repeat / lyrics / queue / AirPlay /
 * volume controls would all be dead weight here. Six elements:
 *
 *   [artwork] [title / artist]  ▶/⏸  [progress]  Apple Music  ×
 *
 * Click the artwork or text → opens the track's Apple Music page
 * (same logic as the in-row Apple pill, so iOS jumps into the app).
 */

import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useT } from '../../../lib/app/i18n';
import { openAppleMusic } from '../../../lib/share/openAppleMusic';
import { FONT, INK, PAPER } from '../../../lib/ui/tokens';
import { AppleMusicIcon } from './AppleMusicIcon';
import {
  nextTrack,
  pausePreview,
  prevTrack,
  resumePreview,
  seekPreview,
  stopPreview,
  usePlayerState,
} from './PreviewPlayer';

// ── Button geometry (single source of truth so every NowPlayingBar
//    button shares the same hit area). 28 px = WCAG 2.5.8 minimum
//    24 + 2 px breathing room top + bottom.
const BTN = 28;
const ICON_PRIMARY = 14; // ▶ ⏸
const ICON_SECONDARY = 13; // ⏮ ⏭ × — slightly smaller so the play
                            // button still reads as the dominant control.

export function NowPlayingBar() {
  const player = usePlayerState();
  const t = useT();
  const visible = !!player.currentId && !!player.meta;
  // Respect WCAG 2.3.3 / Apple HIG Reduce Motion: skip the slide
  // animation entirely when the user has it on. The bar still
  // appears, just without the translate + opacity easing.
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Always render the chrome so the fade transition has something
  // to interpolate on. `pointerEvents: none` when hidden so the
  // bar doesn't intercept clicks while invisible.
  return (
    <div
      role="region"
      aria-label={t('player.nowPlaying')}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 18,
        // CLS 0: the bar always occupies the same fixed slot — only
        // opacity + transform animate. Layout never shifts because
        // the element is `position: fixed` and never reflows others.
        transform: `translateX(-50%) translateY(${visible ? 0 : 16}px)`,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: reducedMotion
          ? 'opacity 1ms linear'
          : 'opacity 180ms ease-out, transform 180ms ease-out',
        zIndex: 100,
        width: 'min(440px, calc(100vw - 32px))',
        background: 'rgba(15,15,20,0.78)',
        color: PAPER,
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(18px) saturate(160%)',
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        padding: '8px 10px 10px',
        display: 'flex', flexDirection: 'column', gap: 6,
        fontFamily: FONT.ui,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Artwork — clickable, opens Apple Music */}
        <button
          type="button"
          onClick={() => player.meta?.appleUrl && openAppleMusic(player.meta.appleUrl)}
          aria-label={t('player.openAppleMusic')}
          disabled={!player.meta?.appleUrl}
          style={{
            flexShrink: 0,
            width: 40, height: 40, borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.10)',
            padding: 0, overflow: 'hidden',
            background: '#222',
            cursor: player.meta?.appleUrl ? 'pointer' : 'default',
            display: 'block',
          }}
        >
          {player.meta?.artworkUrl ? (
            <img
              src={player.meta.artworkUrl}
              alt=""
              width={40} height={40}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              referrerPolicy="no-referrer" decoding="async"
            />
          ) : null}
        </button>

        {/* Title + Artist */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div
            style={{
              fontSize: 12, fontWeight: 700, letterSpacing: -0.1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
            title={player.meta?.title}
          >
            {player.meta?.title || ''}
          </div>
          <div
            style={{
              fontSize: 10.5, color: 'rgba(250,249,246,0.65)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
            title={player.meta?.artist}
          >
            {player.meta?.artist || ''}
          </div>
        </div>

        {/* Prev — restarts current if >3s in, else jumps to previous
            queue entry. Disabled when the queue is empty or we're
            already at the start with playhead < 3s. */}
        <GhostBtn
          onClick={() => prevTrack()}
          disabled={!player.queue.length}
          ariaLabel={t('player.prev')}
        >
          <SkipBack size={ICON_SECONDARY} fill="currentColor" strokeWidth={0} />
        </GhostBtn>

        {/* Play / Pause — dominant control, slightly larger 32 px. */}
        <button
          type="button"
          onClick={() => (player.isPlaying ? pausePreview() : resumePreview())}
          aria-label={player.isPlaying ? t('player.pause') : t('player.play')}
          style={{
            flexShrink: 0,
            width: 32, height: 32, borderRadius: 999,
            border: 'none',
            background: 'rgba(255,255,255,0.92)',
            color: INK,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 100ms ease',
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {player.isPlaying
            ? <Pause size={ICON_PRIMARY} fill="currentColor" strokeWidth={0} />
            : <Play  size={ICON_PRIMARY} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />}
        </button>

        {/* Next — advances queue. Disabled at end. */}
        <GhostBtn
          onClick={() => nextTrack()}
          disabled={
            !player.queue.length
            || player.queue.findIndex((q) => q.id === player.currentId) >= player.queue.length - 1
          }
          ariaLabel={t('player.next')}
        >
          <SkipForward size={ICON_SECONDARY} fill="currentColor" strokeWidth={0} />
        </GhostBtn>

        {/* Open in Apple Music — small square app-icon button.
            28 px so it matches BTN below; AppleMusicIcon was 26 px,
            now bumped to share the same hit area as the controls. */}
        <AppleMusicIcon href={player.meta?.appleUrl} size={BTN} />

        {/* Close — stops playback + hides the bar */}
        <GhostBtn onClick={stopPreview} ariaLabel={t('player.close')}>
          <X size={ICON_SECONDARY} strokeWidth={2.2} />
        </GhostBtn>
      </div>

      {/* Progress bar — click anywhere to seek. Ignored if duration
          isn't loaded yet (preview metadata still streaming). */}
      <ProgressBar
        position={player.position}
        duration={player.duration}
        onSeek={(t) => seekPreview(t)}
      />
    </div>
  );
}

/** Ghost (transparent) icon button. Same 28 × 28 hit area as every
 *  other secondary control on the bar so the row reads as one
 *  toolbar instead of a collection of mismatched widgets. */
function GhostBtn({
  onClick, disabled, ariaLabel, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{
        flexShrink: 0,
        width: BTN, height: BTN, borderRadius: 999,
        border: 'none', background: 'transparent',
        color: 'rgba(250,249,246,0.78)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 120ms ease, opacity 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.10)';
      }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function ProgressBar({
  position, duration, onSeek,
}: { position: number; duration: number; onSeek: (s: number) => void }) {
  const pct = duration > 0 ? Math.max(0, Math.min(1, position / duration)) * 100 : 0;
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio * duration);
  }
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration) || 30}
      aria-valuenow={Math.round(position)}
      onClick={handleClick}
      style={{
        position: 'relative',
        height: 4, borderRadius: 4,
        background: 'rgba(255,255,255,0.14)',
        cursor: duration > 0 ? 'pointer' : 'default',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: `${pct}%`,
        background: 'rgba(255,255,255,0.85)',
        borderRadius: 4,
        transition: 'width 80ms linear',
      }} />
    </div>
  );
}
