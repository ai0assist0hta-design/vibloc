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

import { useEffect, useRef, useState } from 'react';
import {
  Copy, Info, MoreHorizontal, Pause, Play, Plus, Repeat, Repeat1,
  Share2, Shuffle, SkipBack, SkipForward, X,
} from 'lucide-react';
import { useT } from '../../../lib/app/i18n';
import { openAppleMusic } from '../../../lib/share/openAppleMusic';
import {
  isPinned, pinTrack, subscribePlaylists,
} from '../../../lib/music/buildingPlaylist';
import type { RecommendedTrack } from '../../../lib/music/trackTypes';
import { FONT, INK, PAPER, SPACE } from '../../../lib/ui/tokens';
import {
  cycleRepeat,
  nextTrack,
  pausePreview,
  prevTrack,
  resumePreview,
  seekPreview,
  stopPreview,
  toggleShuffle,
  usePlayerState,
} from './PreviewPlayer';

// ── Slide-animation keyframes (injected once, module-level) ──────────
//    Approach distilled from the Framer Motion carousel + react-
//    transition-group manuals: animate transform + opacity ONLY (cheap
//    GPU compositor, no layout) and trigger by re-keying the element
//    on track change. ~240ms ease-out — long enough to read as motion,
//    short enough to feel snappy.
//
//    Two directions:
//      pb-slide-up   = new track came from BELOW (next direction)
//      pb-slide-down = new track came from ABOVE (prev direction)
if (typeof document !== 'undefined' && !document.getElementById('pb-anim-styles')) {
  const s = document.createElement('style');
  s.id = 'pb-anim-styles';
  s.textContent = `
    @keyframes pb-slide-up   { from { transform: translateY(22px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
    @keyframes pb-slide-down { from { transform: translateY(-22px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
    /* Hologram halo — a faint chromatic gradient halo travels through
       the title/artist on track change, then fades. Driven by
       background-position sweep + a fade-to-zero opacity tail so the
       glyph itself stays its original colour after the effect ends.
       Pseudo: applied via inline style with a gradient text-clip layer. */
    @keyframes pb-holo {
      0%   { background-position: -120% 50%; opacity: 0; }
      18%  { opacity: 0.85; }
      55%  { background-position: 120% 50%; opacity: 0.55; }
      100% { background-position: 220% 50%; opacity: 0; }
    }
  `;
  document.head.appendChild(s);
}

// ── Button geometry (single source of truth so every NowPlayingBar
//    button shares the same hit area). 28 px = WCAG 2.5.8 minimum
//    24 + 2 px breathing room top + bottom.
const BTN = 28;
const ICON_PRIMARY = 14; // ▶ ⏸
const ICON_SECONDARY = 13; // ⏮ ⏭ × — slightly smaller so the play
                            // button still reads as the dominant control.

export function NowPlayingBar({
  darkMode = false,
  selectedBuildingId = null,
}: {
  darkMode?: boolean;
  /** When a building is selected, the + button on the bar adds the
   *  current track to that building's playlist. Null = + disabled. */
  selectedBuildingId?: string | null;
} = {}) {
  const player = usePlayerState();
  const t = useT();
  const visible = !!player.currentId && !!player.meta;

  // Subscribe to playlist store mutations so the + button flips to
  // "added" right after the user pins. Cheap re-render: only one
  // boolean is derived from the store.
  const [, forcePlaylistTick] = useState(0);
  useEffect(() => subscribePlaylists(() => forcePlaylistTick((n) => n + 1)), []);
  const isAlreadyAdded = !!(
    selectedBuildingId && player.currentId
    && isPinned(selectedBuildingId, player.currentId)
  );

  function handleAddToPlaylist() {
    if (!selectedBuildingId || !player.currentId || !player.meta) return;
    if (isAlreadyAdded) return;
    // Reconstruct a RecommendedTrack from the player meta + queue
    // entry. Genre / primaryGenreName aren't carried in the player
    // metadata, so we default to "pop" — this is acceptable: the
    // tracking pipeline only uses genre as a soft signal for the
    // recommender, not as a required field.
    const queueEntry = player.queue.find((q) => q.id === player.currentId);
    const track: RecommendedTrack = {
      id: player.currentId,
      trackName: player.meta.title,
      artistName: player.meta.artist,
      artworkUrl: player.meta.artworkUrl ?? '',
      previewUrl: queueEntry?.url ?? '',
      primaryGenreName: 'Music',
      genre: 'pop',
      trackViewUrl: player.meta.appleUrl ?? '',
    };
    pinTrack(selectedBuildingId, track);
  }

  // Theme-aware colour roles. Edgeless glass means there's no fill
  // doing the contrast work — text colour has to carry it. Light
  // mode: dark INK glyphs on a slight dark veil. Dark mode: PAPER
  // glyphs on a slight light veil. Both meet WCAG ≥4.5:1 against the
  // city tiles directly under the bar.
  const ink = darkMode ? PAPER : INK;
  const inkSoft = darkMode ? 'rgba(250,249,246,0.72)' : 'rgba(26,26,46,0.68)';
  const ghostHover = darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';


  // Slide direction tracker. On every track change we compare the new
  // queue index to the previous one; "next" direction → new content
  // slides UP from below (the visual metaphor matches the user's
  // mental model of the queue advancing forward). "prev" → opposite.
  const prevIdRef = useRef(player.currentId);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  // Bumped on every track change to re-key the stack and re-trigger
  // the keyframe animation. (Plain key={currentId} works too, but a
  // monotonic counter avoids any edge case where the same id replays.)
  const [animTick, setAnimTick] = useState(0);
  useEffect(() => {
    const newId = player.currentId;
    const oldId = prevIdRef.current;
    if (newId === oldId) return;
    const oldIdx = player.queue.findIndex((q) => q.id === oldId);
    const newIdx = player.queue.findIndex((q) => q.id === newId);
    setDirection(newIdx >= oldIdx ? 'up' : 'down');
    setAnimTick((n) => n + 1);
    prevIdRef.current = newId;
  }, [player.currentId, player.queue]);

  // Respect WCAG 2.3.3 / Apple HIG Reduce Motion: skip the slide
  // animation entirely when the user has it on. The bar still
  // appears, just without the translate + opacity easing.
  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slideAnim = reducedMotion
    ? undefined
    : `${direction === 'up' ? 'pb-slide-up' : 'pb-slide-down'} 260ms cubic-bezier(0.22, 1, 0.36, 1)`;

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
        bottom: 36,
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
        // Wider footprint — Apple Music macOS is ~720 px to fit
        // shuffle/prev/play/next/repeat + center music + ⋯/+/×.
        width: 'min(720px, calc(100vw - 32px))',
        // Glass surface lives in a separate masked layer (rendered
        // first child below) so the TOP and BOTTOM edges fade into
        // the city via a vertical gradient mask. Content (artwork,
        // text, buttons) stays crisp because the mask only applies
        // to the backdrop layer, not the bar's own children.
        background: 'transparent',
        color: ink,
        // No radius — squared edges, no rounded chrome.
        borderRadius: 0,
        border: 'none',
        boxShadow: 'none',
        // Padding + gap normalized to 8pt grid: 12 / 16 outside,
        // SPACE[2] (= 8 px) vertical rhythm between the three
        // internal blocks (stack / controls / progress).
        padding: `${SPACE[3]}px ${SPACE[4]}px`,
        display: 'flex', flexDirection: 'column', gap: SPACE[2],
        fontFamily: FONT.ui,
        // Stacking context for the masked backdrop layer.
        isolation: 'isolate',
      }}
    >
      {/* Backdrop layer: fill + blur with a TOP/BOTTOM-only fade so
          the rectangle's horizontal edges dissolve into the city.
          Left/right stay sharp because the user reads the bar as
          a centered band; only the vertical seams looked boxy. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          zIndex: -1,
          borderRadius: 0,
          // Lighter veil so the transparency reads stronger than the fill.
          background: darkMode ? 'rgba(15,15,20,0.32)' : 'rgba(255,255,255,0.32)',
          backdropFilter: 'blur(16px) saturate(130%)',
          WebkitBackdropFilter: 'blur(16px) saturate(130%)',
          // Gradient core RE-CENTERED on the song row (artwork +
          // title + artist). The bar's vertical layout is
          //   [12 pad] · [song row 40] · [8 gap] · [progress 16] · [12 pad]
          // so the song's vertical center sits at ≈ 37 %, not 50 %.
          // Stops are shifted up to put the opaque core around the
          // song; the progress bar at the bottom rides the natural
          // bottom-ramp falloff.
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 16%, black 58%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 16%, black 58%, transparent 100%)',
        }}
      />
      {/* ── Apple Music-style single horizontal row ──
            ┌───────────────────────────────────────────────────────────────┐
            │ [⇄] [⏮] [▶] [⏭] [⟳]  [art] Title       [⋯] [+]            [×] │
            │                              Artist                           │
            └───────────────────────────────────────────────────────────────┘
          The whole row re-keys on track change so the title/artist
          fade-slide animation still plays. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACE[3],
      }}>
        {/* Left: shuffle / prev / PLAY / next / repeat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1] }}>
          <GhostBtn
            onClick={toggleShuffle}
            ariaLabel={t('player.shuffle')}
            ink={player.shuffle ? ink : inkSoft}
            hover={ghostHover}
            active={player.shuffle}
          >
            <Shuffle size={ICON_SECONDARY} strokeWidth={2.2} />
          </GhostBtn>

          <GhostBtn
            onClick={() => prevTrack()}
            disabled={!player.queue.length}
            ariaLabel={t('player.prev')}
            ink={inkSoft} hover={ghostHover}
          >
            <SkipBack size={ICON_SECONDARY} fill="currentColor" strokeWidth={0} />
          </GhostBtn>

          {/* PLAY — dominant control, larger circle. Theme-flipped fog. */}
          <button
            type="button"
            onClick={() => (player.isPlaying ? pausePreview() : resumePreview())}
            aria-label={player.isPlaying ? t('player.pause') : t('player.play')}
            style={{
              flexShrink: 0,
              width: 36, height: 36, borderRadius: 999,
              border: darkMode
                ? '1px solid rgba(255,255,255,0.18)'
                : '1px solid rgba(0,0,0,0.14)',
              background: darkMode
                ? 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.10) 55%, rgba(255,255,255,0.04) 100%)'
                : 'radial-gradient(circle at 30% 30%, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.02) 100%)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              color: ink,
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 100ms ease, background 160ms ease',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {player.isPlaying
              ? <Pause size={16} fill="currentColor" strokeWidth={0} />
              : <Play  size={16} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />}
          </button>

          <GhostBtn
            onClick={() => nextTrack()}
            disabled={
              !player.queue.length
              || (
                player.queue.findIndex((q) => q.id === player.currentId) >= player.queue.length - 1
                && player.repeat !== 'all' && !player.shuffle
              )
            }
            ariaLabel={t('player.next')}
            ink={inkSoft} hover={ghostHover}
          >
            <SkipForward size={ICON_SECONDARY} fill="currentColor" strokeWidth={0} />
          </GhostBtn>

          <GhostBtn
            onClick={cycleRepeat}
            ariaLabel={t('player.repeat')}
            ink={player.repeat !== 'off' ? ink : inkSoft}
            hover={ghostHover}
            active={player.repeat !== 'off'}
          >
            {player.repeat === 'one'
              ? <Repeat1 size={ICON_SECONDARY} strokeWidth={2.2} />
              : <Repeat  size={ICON_SECONDARY} strokeWidth={2.2} />}
          </GhostBtn>
        </div>

        {/* Center: artwork + title/artist. Re-keys on track change for
            the slide+fade animation. flex:1 fills the gap so the
            right-side toolbar stays anchored. */}
        <div
          key={animTick}
          style={{
            flex: 1, minWidth: 0,
            display: 'flex', alignItems: 'center', gap: SPACE[3],
            animation: slideAnim,
            willChange: 'transform, opacity',
          }}
        >
          <button
            type="button"
            onClick={() => player.meta?.appleUrl && openAppleMusic(player.meta.appleUrl)}
            aria-label={t('player.openAppleMusic')}
            disabled={!player.meta?.appleUrl}
            style={{
              flexShrink: 0,
              width: 40, height: 40, borderRadius: 6,
              border: darkMode
                ? '1px solid rgba(255,255,255,0.10)'
                : '1px solid rgba(0,0,0,0.08)',
              padding: 0, overflow: 'hidden',
              background: darkMode ? '#222' : '#eee',
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

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <HoloText
              text={player.meta?.title || ''}
              fontSize={13} fontWeight={700} color={ink}
              animTick={animTick}
              reducedMotion={reducedMotion}
            />
            <HoloText
              text={player.meta?.artist || ''}
              fontSize={11} fontWeight={500} color={inkSoft}
              animTick={animTick}
              reducedMotion={reducedMotion}
            />
          </div>

          {/* "..." menu — sits at the END of the center music block. */}
          <MoreMenu
            appleUrl={player.meta?.appleUrl}
            title={player.meta?.title}
            artist={player.meta?.artist}
            ink={inkSoft} hover={ghostHover}
            menuInk={ink}
            menuBg={darkMode ? 'rgba(28,28,32,0.95)' : 'rgba(255,255,255,0.95)'}
            menuBorder={darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}
          />

          {/* "+" — Add the current track to MY playlist for the
              currently selected building. Disabled when no building
              is selected (+ has no anchor). Flips to a filled "added"
              state once pinned so the user gets immediate confirm. */}
          <GhostBtn
            onClick={handleAddToPlaylist}
            disabled={!selectedBuildingId || isAlreadyAdded}
            ariaLabel={isAlreadyAdded ? t('player.added') : t('player.add')}
            ink={isAlreadyAdded ? ink : inkSoft}
            hover={ghostHover}
            active={isAlreadyAdded}
          >
            <Plus size={ICON_SECONDARY} strokeWidth={isAlreadyAdded ? 3 : 2.4} />
          </GhostBtn>
        </div>

        {/* Right: close. */}
        <GhostBtn onClick={stopPreview} ariaLabel={t('player.close')} ink={inkSoft} hover={ghostHover}>
          <X size={ICON_SECONDARY} strokeWidth={2.2} />
        </GhostBtn>
      </div>

      {/* Progress bar — click anywhere to seek. Ignored if duration
          isn't loaded yet (preview metadata still streaming). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2] }}>
        <span style={{
          fontFamily: FONT.mono, fontSize: 11, color: inkSoft,
          minWidth: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
        }}>
          {fmtTime(player.position)}
        </span>
        <div style={{ flex: 1 }}>
          <ProgressBar
            position={player.position}
            duration={player.duration}
            onSeek={(t) => seekPreview(t)}
            darkMode={darkMode}
          />
        </div>
        <span style={{
          fontFamily: FONT.mono, fontSize: 11, color: inkSoft,
          minWidth: 32, textAlign: 'left', fontVariantNumeric: 'tabular-nums',
        }}>
          {fmtTime(player.duration)}
        </span>
      </div>
    </div>
  );
}

/** Ghost (transparent) icon button. Same 28 × 28 hit area as every
 *  other secondary control on the bar so the row reads as one
 *  toolbar instead of a collection of mismatched widgets. */
function GhostBtn({
  onClick, disabled, ariaLabel, children, ink, hover, active,
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
  ink: string;
  hover: string;
  /** Toggle button "on" state — Apple Music highlights shuffle /
   *  repeat with a subtle background fill when active. */
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={ariaLabel}
      style={{
        flexShrink: 0,
        width: BTN, height: BTN, borderRadius: 999,
        border: 'none',
        background: active ? hover : 'transparent',
        color: ink,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 120ms ease, opacity 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? hover : 'transparent';
      }}
    >
      {children}
    </button>
  );
}

/** Title / artist label with a fading "hologram" gradient sweep on
 *  track change. Two stacked layers:
 *    1) the actual glyph (color: ink, always visible)
 *    2) an absolutely-positioned overlay of the same text painted
 *       with a chromatic linear-gradient, clipped to glyph shape via
 *       background-clip:text. A keyframe sweeps the gradient across
 *       and fades the overlay's opacity to zero, so after ~700 ms
 *       only the original-colored glyph remains.
 *
 *  Re-keys on `animTick` so the keyframe replays each track change.
 *  Skipped entirely when `prefers-reduced-motion` is on. */
function HoloText({
  text, fontSize, fontWeight, color, animTick, reducedMotion,
}: {
  text: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  animTick: number;
  reducedMotion: boolean;
}) {
  const base: React.CSSProperties = {
    fontSize, fontWeight, color,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    letterSpacing: -0.1,
  };
  if (reducedMotion || !text) {
    return <div style={base} title={text}>{text}</div>;
  }
  return (
    <div style={{ position: 'relative', ...base }} title={text}>
      <span aria-hidden={false}>{text}</span>
      <span
        key={animTick}
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          // Chromatic sweep: cool→warm→cool gradient. Gradient is
          // 300% wide so the keyframe can pan it across without
          // showing the seam.
          backgroundImage:
            'linear-gradient(100deg, rgba(120,160,255,0) 0%, rgba(120,160,255,0.65) 18%, rgba(255,150,210,0.85) 38%, rgba(255,210,140,0.65) 58%, rgba(160,255,210,0) 80%)',
          backgroundSize: '300% 100%',
          backgroundRepeat: 'no-repeat',
          // Clip the gradient to the glyph silhouette so we get a
          // text-shaped halo, not a colored rectangle.
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
          pointerEvents: 'none',
          animation: 'pb-holo 720ms cubic-bezier(0.22, 1, 0.36, 1) both',
          fontSize, fontWeight,
          letterSpacing: -0.1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {text}
      </span>
    </div>
  );
}

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ProgressBar({
  position, duration, onSeek, darkMode = false,
}: { position: number; duration: number; onSeek: (s: number) => void; darkMode?: boolean }) {
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
        background: darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)',
        cursor: duration > 0 ? 'pointer' : 'default',
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: `${pct}%`,
        background: darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(26,26,46,0.78)',
        borderRadius: 4,
        transition: 'width 80ms linear',
      }} />
    </div>
  );
}

/** Track context menu — modeled on Apple Music macOS's row "..." menu.
 *  Anchored above the trigger (the bar lives at the bottom of the
 *  viewport so a downward popover would clip off-screen). Click-outside
 *  + Escape close. Each row has a leading lucide icon for fast scan.
 *
 *  Item set is intentionally trimmed to what makes sense for a 30 s
 *  preview player with no library / no signed-in account:
 *    - Track info → opens Apple Music (deep link, stays in app on iOS)
 *    - Share      → copies a vibloc.app link for this track preview
 *    - Copy       → "Title — Artist" to the clipboard for messaging */
function MoreMenu({
  appleUrl, title, artist, ink, hover, menuInk, menuBg, menuBorder,
}: {
  appleUrl?: string;
  title?: string;
  artist?: string;
  ink: string;
  hover: string;
  menuInk: string;
  menuBg: string;
  menuBorder: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Click-outside + Escape to close. Standard popover ergonomics.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1400);
    } catch {
      // Older Safari etc — silently no-op rather than throwing.
    }
  }

  function handleInfo() {
    // "Track info" item routes straight to Apple Music — same flow
    // as Apple Music macOS's "Show in Apple Music" item, which the
    // user explicitly requested.
    if (appleUrl) openAppleMusic(appleUrl);
    setOpen(false);
  }

  function handleShare() {
    // Zero-backend share: copy the Apple Music link itself so the
    // recipient lands on the exact track. Falls back to title/artist
    // search URL when the deep link is missing.
    const link = appleUrl
      ?? (title || artist
            ? `https://music.apple.com/search?term=${encodeURIComponent(`${title ?? ''} ${artist ?? ''}`.trim())}`
            : '');
    if (link) copy(link, 'share');
  }

  function handleCopy() {
    const text = [title, artist].filter(Boolean).join(' — ');
    if (text) copy(text, 'copy');
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('player.menu.more')}
        title={t('player.menu.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          flexShrink: 0,
          width: 28, height: 28, borderRadius: 999,
          border: 'none', background: 'transparent',
          color: ink,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 120ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <MoreHorizontal size={14} strokeWidth={2.4} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            // Anchored ABOVE the button: the NowPlayingBar lives at
            // the bottom of the viewport, so dropping down would
            // clip off-screen.
            bottom: 'calc(100% + 8px)',
            right: -4,
            minWidth: 180,
            padding: SPACE[1],
            borderRadius: 10,
            background: menuBg,
            border: `1px solid ${menuBorder}`,
            backdropFilter: 'blur(20px) saturate(140%)',
            WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)',
            color: menuInk,
            fontFamily: FONT.ui,
            fontSize: 13,
            zIndex: 110,
            display: 'flex', flexDirection: 'column', gap: 0,
          }}
        >
          <MenuItem
            icon={<Info size={14} strokeWidth={2.2} />}
            label={t('player.menu.info')}
            onClick={handleInfo}
            disabled={!appleUrl}
            menuInk={menuInk} hover={hover}
          />
          <MenuItem
            icon={<Share2 size={14} strokeWidth={2.2} />}
            label={copiedKey === 'share' ? t('player.menu.copied') : t('player.menu.share')}
            onClick={handleShare}
            disabled={!appleUrl && !title && !artist}
            menuInk={menuInk} hover={hover}
          />
          <MenuItem
            icon={<Copy size={14} strokeWidth={2.2} />}
            label={copiedKey === 'copy' ? t('player.menu.copied') : t('player.menu.copy')}
            onClick={handleCopy}
            disabled={!title && !artist}
            menuInk={menuInk} hover={hover}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon, label, onClick, disabled, menuInk, hover,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  menuInk: string;
  hover: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: SPACE[2],
        padding: `${SPACE[2]}px ${SPACE[3]}px`,
        border: 'none', background: 'transparent',
        color: menuInk,
        fontFamily: FONT.ui,
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        textAlign: 'left',
        borderRadius: 6,
        transition: 'background 120ms ease',
        width: '100%',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        width: 18, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}
