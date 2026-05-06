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
  Info, MoreHorizontal, Pause, Play, Plus, Repeat, Repeat1,
  Share2, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import { useT } from '../../../lib/app/i18n';
import { openAppleMusic } from '../../../lib/share/openAppleMusic';
import {
  isPinned, pinTrack, subscribePlaylists,
} from '../../../lib/music/buildingPlaylist';
import type { RecommendedTrack } from '../../../lib/music/trackTypes';
import { APPLE_RED, FONT, INK, PAPER, SPACE } from '../../../lib/ui/tokens';
import {
  cycleRepeat,
  nextTrack,
  pausePreview,
  prevTrack,
  resumePreview,
  seekPreview,
  setVolume,
  toggleMute,
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
    /* Track-change slide: 18 px (was 22) so motion is felt without
       overshooting; Apple Music macOS uses ~16-20 px here. The
       opacity fade is paired but slightly delayed via cubic-bezier
       (handled inline on the animation container). */
    @keyframes pb-slide-up   { from { transform: translateY(18px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
    @keyframes pb-slide-down { from { transform: translateY(-18px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
    /* Hologram halo — a faint chromatic gradient halo travels through
       the title/artist on track change, then fades. Driven by
       background-position sweep + a fade-to-zero opacity tail so the
       glyph itself stays its original colour after the effect ends. */
    @keyframes pb-holo {
      0%   { background-position: -120% 50%; opacity: 0; }
      18%  { opacity: 0.85; }
      55%  { background-position: 120% 50%; opacity: 0.55; }
      100% { background-position: 220% 50%; opacity: 0; }
    }
  `;
  document.head.appendChild(s);
}

/** Apple motion tokens — single source of truth for every animation
 *  on the bar. Curves lifted from Apple's iOS 14+ / macOS Big Sur+
 *  motion spec (verified against the SwiftUI .smooth / .snappy
 *  defaults).
 *
 *    EASE.smooth — fast start, gentle settle; the most common
 *      Apple "feels right" curve. Used for bar mount, hover fills,
 *      icon transitions.
 *    EASE.snappy — sharper exit, popular for content changes
 *      (track slide, panel reveals).
 *    EASE.tactile — slight overshoot at 1.0; used on press release
 *      so buttons feel like they "spring back" with weight. */
const EASE = {
  smooth:  'cubic-bezier(0.32, 0.72, 0, 1)',
  snappy:  'cubic-bezier(0.22, 1, 0.36, 1)',
  tactile: 'cubic-bezier(0.34, 1.36, 0.64, 1)',
} as const;

/** Standard durations — short for chrome, medium for content,
 *  longer for delight. Apple calls these "rapid", "instant",
 *  "smooth" in the SwiftUI Animation API. */
const DUR = {
  hover:        140, // bg/color hover lift
  press:        220, // button press release (compress is half of this)
  bar:          280, // mini-player mount/unmount
  trackChange:  340, // track row slide+fade
} as const;

// ── Button geometry — Apple Music macOS hierarchy.
//    Three-step ladder so the row reads as a clear visual sentence:
//      PLAY      36 px (dominant — see inline play button)
//      NAV       32 px (prev / next — primary navigation)
//      TOGGLE    28 px (shuffle / repeat / volume / + / × — secondary)
//    All ≥ 24 px (WCAG 2.5.8) and use the same icon size so the
//    dot-density scales cleanly with the hit area.
const BTN = 28;       // toggles, side controls
const BTN_NAV = 32;   // prev / next — primary navigation
const ICON_PRIMARY = 16; // ▶ ⏸ — 16 px so the play icon stays dominant inside the 36 px circle
const ICON_SECONDARY = 13; // toggles + side controls
const ICON_NAV = 14; // prev / next — slightly larger to match BTN_NAV

export function NowPlayingBar({
  darkMode = false,
  selectedBuildingId = null,
  selectedBuildingName = null,
}: {
  darkMode?: boolean;
  /** When a building is selected, the + button on the bar adds the
   *  current track to that building's playlist. Null = + disabled. */
  selectedBuildingId?: string | null;
  /** Pretty name of the currently-selected building. Surfaced in the
   *  + button's tooltip ("Pin to ${name}") so the user knows where
   *  the pin is going to land before clicking. */
  selectedBuildingName?: string | null;
} = {}) {
  const player = usePlayerState();
  const t = useT();
  const visible = !!player.currentId && !!player.meta;

  // Subscribe to playlist store mutations so the + button flips to
  // "added" right after the user pins. Cheap re-render: only one
  // boolean is derived from the store.
  const [, forcePlaylistTick] = useState(0);
  useEffect(() => subscribePlaylists(() => forcePlaylistTick((n) => n + 1)), []);

  // Resolution chain for the + target building:
  //   1. queue's source (the building whose playlist seeded current
  //      playback) — survives even after user deselects the building
  //   2. user's currently-selected building — fallback
  // As long as ANY track is playing it came from some building, so
  // this almost always resolves. The only case + is disabled is when
  // the track is already pinned (per user spec).
  const targetBuildingId = player.currentBuildingId ?? selectedBuildingId ?? null;
  const isAlreadyAdded = !!(
    targetBuildingId && player.currentId
    && isPinned(targetBuildingId, player.currentId)
  );

  function handleAddToPlaylist() {
    if (!targetBuildingId || !player.currentId || !player.meta) return;
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
    // pinTrack auto-creates the per-building entry when none exists
    // (getEntry default `{tracks: [], description: ''}` + the spread
    // assigns a fresh entry on first pin), so "auto-create my
    // playlist if none exists" is implicit.
    pinTrack(targetBuildingId, track);
  }

  // Theme-aware colour roles. Edgeless glass means there's no fill
  // doing the contrast work — text colour has to carry it. Light
  // mode: dark INK glyphs on a slight dark veil. Dark mode: PAPER
  // glyphs on a slight light veil. Both meet WCAG ≥4.5:1 against the
  // city tiles directly under the bar.
  const ink = darkMode ? PAPER : INK;
  const inkSoft = darkMode ? 'rgba(250,249,246,0.72)' : 'rgba(14,14,26,0.68)';
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
  // Track-change slide: extended 260 → 340 ms so the title settles
  // visibly instead of snapping. The Apple .snappy curve still
  // gives the entry punch — just with a longer tail.
  const slideAnim = reducedMotion
    ? undefined
    : `${direction === 'up' ? 'pb-slide-up' : 'pb-slide-down'} ${DUR.trackChange}ms ${EASE.snappy}`;

  // Always render the chrome so the fade transition has something
  // to interpolate on. `pointerEvents: none` when hidden so the
  // bar doesn't intercept clicks while invisible.
  return (
    <div
      role="region"
      aria-label={t('player.nowPlaying')}
      style={{
        position: 'fixed',
        // Centered between the two side rails — uses live CSS
        // variables `--vbk-left-rail-w` / `--vbk-right-rail-w`
        // published by FixedToolSidebar / FixedQueueSidebar on every
        // resize / collapse. Falls back to 280 px when neither rail
        // is mounted yet (first paint before the effect fires).
        // The bar slides automatically as the user drags either
        // rail's resize handle.
        left: 'calc(var(--vbk-left-rail-w, 280px) + (100vw - var(--vbk-left-rail-w, 280px) - var(--vbk-right-rail-w, 280px)) / 2)',
        bottom: 36,
        // CLS 0: the bar always occupies the same fixed slot — only
        // opacity + transform animate. Layout never shifts because
        // the element is `position: fixed` and never reflows others.
        transform: `translateX(-50%) translateY(${visible ? 0 : 16}px)`,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        // Bar mount/unmount: opacity tracks transform on the same
        // Apple .smooth curve so the rise reads as one motion, not
        // two separately-easing properties drifting out of sync.
        transition: reducedMotion
          ? 'opacity 1ms linear'
          : `opacity ${DUR.bar}ms ${EASE.smooth}, transform ${DUR.bar}ms ${EASE.smooth}`,
        // Sits one tier above the side rails (40) so the floating
        // bar always reads as the topmost chrome. Was 100 — gratu-
        // itously high; reserved >100 for true overlays (modals,
        // popover menus at 1000).
        zIndex: 50,
        // Width caps — adapts to actual rail widths:
        //   • 720 px target (Apple Music macOS now-playing strip).
        //   • Subtract live `--vbk-left-rail-w` + `--vbk-right-rail-w`
        //     plus 32 px breathing room so the bar never overlaps
        //     either rail at any resize position.
        //   • Hard floor 320 px so the bar stays usable on very
        //     narrow viewports (mobile-portrait fallback).
        width: 'max(320px, min(720px, calc(100vw - var(--vbk-left-rail-w, 280px) - var(--vbk-right-rail-w, 280px) - 32px)))',
        // Glass surface lives in a separate masked layer (rendered
        // first child below) so the TOP and BOTTOM edges fade into
        // the city via a vertical gradient mask. Content (artwork,
        // text, buttons) stays crisp because the mask only applies
        // to the backdrop layer, not the bar's own children.
        background: 'transparent',
        color: ink,
        // Floating-card radius is applied to the backdrop layer
        // (below) — NOT to this outer container. If we put
        // overflow:hidden + borderRadius here, the MoreMenu popover
        // that opens ABOVE the bar gets clipped to the bar's bounds
        // and disappears entirely. Outer stays overflow:visible so
        // floating menus + tooltips escape; the visible glass
        // rectangle gets its rounded corners from the backdrop div.
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
      {/* Backdrop layer: Apple-style frosted glass — no border, no
          shadow, no gradient mask. Matches FixedToolSidebar /
          FixedQueueSidebar's edgeless treatment so the three chrome
          surfaces (left rail, right rail, bottom bar) read as one
          glass system floating over the 3D city. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          zIndex: -1,
          // Rounded corners live HERE (the backdrop) not on the
          // outer container — see comment on the parent's lack of
          // overflow:hidden. Visually identical: the glass IS the
          // pill, and the outer div is just a positioning wrapper.
          borderRadius: 16,
          background: darkMode ? 'rgba(20,20,24,0.55)' : 'rgba(250,250,252,0.55)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: 'none',
          boxShadow: 'none',
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
        {/* Left: shuffle / prev / PLAY / next / repeat
            Gap bumped 4 → 6 px so the three different button sizes
            (28 / 32 / 36) optically read as a single transport
            cluster instead of mashed-together pills. Apple Music
            macOS uses a comparable 6 px gap in this density. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <GhostBtn
            onClick={toggleShuffle}
            ariaLabel={t('player.shuffle')}
            ink={player.shuffle ? APPLE_RED : inkSoft}
            hover={ghostHover}
          >
            <Shuffle
              size={ICON_SECONDARY}
              strokeWidth={player.shuffle ? 2.6 : 2.2}
              style={player.shuffle
                ? { filter: 'drop-shadow(0 0 4px rgba(250,36,60,0.45))' }
                : undefined}
            />
          </GhostBtn>

          <GhostBtn
            onClick={() => prevTrack()}
            disabled={!player.queue.length}
            ariaLabel={t('player.prev')}
            ink={inkSoft} hover={ghostHover}
            size={BTN_NAV}
          >
            <SkipBack size={ICON_NAV} fill="currentColor" strokeWidth={0} />
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
              // Tactile press: 80 ms compress (linear feel — finger
              // is pressing), 220 ms release with subtle overshoot
              // (Apple .tactile curve) so the button "springs back"
              // with weight. Differential timing is set by swapping
              // the transition string on press vs release.
              transition: `transform 220ms ${EASE.tactile}, background 160ms ${EASE.smooth}`,
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transition = `transform 80ms linear, background 160ms ${EASE.smooth}`;
              e.currentTarget.style.transform = 'scale(0.94)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transition = `transform 220ms ${EASE.tactile}, background 160ms ${EASE.smooth}`;
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transition = `transform 220ms ${EASE.tactile}, background 160ms ${EASE.smooth}`;
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {player.isPlaying
              ? <Pause size={ICON_PRIMARY} fill="currentColor" strokeWidth={0} />
              : <Play  size={ICON_PRIMARY} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />}
          </button>

          <GhostBtn
            onClick={() => nextTrack()}
            disabled={(() => {
              if (!player.queue.length) return true;
              // Always-actionable when shuffle / repeat:all or when
              // current track isn't a member of the queue (next falls
              // through to queue[0] in that case — see nextTrack).
              if (player.shuffle || player.repeat === 'all') return false;
              const i = player.queue.findIndex((q) => q.id === player.currentId);
              if (i < 0) return false;
              return i >= player.queue.length - 1;
            })()}
            ariaLabel={t('player.next')}
            ink={inkSoft} hover={ghostHover}
            size={BTN_NAV}
          >
            <SkipForward size={ICON_NAV} fill="currentColor" strokeWidth={0} />
          </GhostBtn>

          <GhostBtn
            onClick={cycleRepeat}
            ariaLabel={t('player.repeat')}
            ink={player.repeat !== 'off' ? APPLE_RED : inkSoft}
            hover={ghostHover}
          >
            {(() => {
              const active = player.repeat !== 'off';
              const glow = active
                ? { filter: 'drop-shadow(0 0 4px rgba(250,36,60,0.45))' }
                : undefined;
              return player.repeat === 'one'
                ? <Repeat1 size={ICON_SECONDARY} strokeWidth={2.6} style={glow} />
                : <Repeat  size={ICON_SECONDARY} strokeWidth={active ? 2.6 : 2.2} style={glow} />;
            })()}
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
            // Per spec: + only disables when (a) the track is already
            // in my playlist, or (b) there's literally no track + no
            // building anywhere (idle bar — extremely rare since the
            // bar is hidden in that state). targetBuildingId resolves
            // through queue source → selection so even after the user
            // deselects the building, + keeps working.
            disabled={isAlreadyAdded || !targetBuildingId || !player.currentId}
            ariaLabel={
              isAlreadyAdded
                ? t('player.added')
                : !targetBuildingId
                  ? t('player.addNoBuilding')
                  : selectedBuildingName
                    ? t('player.addToBuilding', { name: selectedBuildingName })
                    : t('player.add')
            }
            ink={isAlreadyAdded ? APPLE_RED : inkSoft}
            hover={ghostHover}
          >
            <Plus size={ICON_SECONDARY} strokeWidth={isAlreadyAdded ? 3 : 2.4} />
          </GhostBtn>
        </div>

        {/* Volume — speaker icon (click = mute toggle) + slider. */}
        <VolumeControl
          volume={player.volume}
          muted={player.muted}
          ink={inkSoft}
          hover={ghostHover}
          darkMode={darkMode}
          ariaSpeaker={t('player.volume')}
          ariaMute={player.muted ? t('player.unmute') : t('player.mute')}
        />

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
        {/* Preview-length disclaimer — Apple Music free tier serves
            30 s previews. Without this label users assume the bar is
            buggy when the track ends at 0:30 and auto-advances. */}
        <span style={{
          fontFamily: FONT.mono, fontSize: 9, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: inkSoft, opacity: 0.7,
          padding: '2px 6px', borderRadius: 4,
          background: ghostHover,
          flexShrink: 0,
        }}>
          {t('player.preview')}
        </span>
      </div>
    </div>
  );
}

/** Ghost (transparent) icon button. Default 28 × 28 hit area for
 *  toggles + side controls; pass `size={BTN_NAV}` for the primary
 *  prev / next nav controls so they read one tier above the toggles
 *  per Apple Music macOS hierarchy. */
function GhostBtn({
  onClick, disabled, ariaLabel, children, ink, hover, active, size = BTN,
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
  /** Hit-area size in px. Default 28 (toggles); use BTN_NAV (32)
   *  for prev / next so the navigation pair reads one tier above
   *  the surrounding toggles. */
  size?: number;
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
        width: size, height: size, borderRadius: 999,
        border: 'none',
        background: active ? hover : 'transparent',
        color: ink,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: `background ${DUR.hover}ms ${EASE.smooth}, opacity ${DUR.hover}ms ${EASE.smooth}`,
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
    // Apple SF Pro body tracking — `-0.022em` for 11–17 px text.
    // Was a flat `-0.1` (raw px) which barely registered at 11 px
    // and over-tightened at 17 px.
    letterSpacing: '-0.022em',
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
          animation: 'pb-holo 1100ms cubic-bezier(0.22, 1, 0.36, 1) both',
          fontSize, fontWeight,
          letterSpacing: '-0.022em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {text}
      </span>
    </div>
  );
}

/** Speaker icon + slider, Apple Music macOS pattern. Click the icon
 *  to toggle mute (preserves the volume level). Drag the slider to
 *  set 0..1; raising while muted auto-unmutes (the slider gesture
 *  signals "I want to hear this"). Volume persists to localStorage. */
function VolumeControl({
  volume, muted, ink, hover, darkMode, ariaSpeaker, ariaMute,
}: {
  volume: number;
  muted: boolean;
  ink: string;
  hover: string;
  darkMode: boolean;
  ariaSpeaker: string;
  ariaMute: string;
}) {
  const effective = muted ? 0 : volume;
  // Pick the speaker icon by level — VolumeX (mute) / Volume1 (low) /
  // Volume2 (mid+). Mirrors Apple Music's three-state speaker glyph.
  const Icon = effective <= 0
    ? VolumeX
    : effective < 0.5
      ? Volume1
      : Volume2;

  // White fill (user request: "음량 바 파란색 말고 그냥 흰색으로").
  // On light mode the white fill would vanish, so we keep a soft
  // ink fill there for readability — only the dark hero / dark mode
  // case actually shows the bar over a dark surface.
  const trackBg = darkMode ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)';
  const fillBg  = darkMode ? '#ffffff' : 'rgba(14,14,26,0.78)';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE[1] }}>
      <button
        type="button"
        onClick={toggleMute}
        aria-label={ariaMute}
        title={ariaMute}
        style={{
          flexShrink: 0,
          width: BTN, height: BTN, borderRadius: 999,
          border: 'none', background: 'transparent',
          color: ink,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transition: `background ${DUR.hover}ms ${EASE.smooth}`,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <Icon size={ICON_SECONDARY} strokeWidth={2.2} />
      </button>

      {/* Native range input — accessible, tab-focusable, keyboard
          arrows step ±1 %. Smaller than the progress bar (52×3 vs
          full-width × 4) and gets a small white thumb via the
          dedicated `vibloc-vol-slider` class so the OS default
          blue accent never shows. */}
      <input
        type="range"
        className="vibloc-vol-slider"
        min={0} max={1} step={0.01}
        value={effective}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        aria-label={ariaSpeaker}
        style={{
          width: 52,
          height: 3,
          appearance: 'none',
          WebkitAppearance: 'none',
          background: `linear-gradient(to right, ${fillBg} 0%, ${fillBg} ${effective * 100}%, ${trackBg} ${effective * 100}%, ${trackBg} 100%)`,
          borderRadius: 3,
          outline: 'none',
          cursor: 'pointer',
          accentColor: '#ffffff',
        }}
      />
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
        background: darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(14,14,26,0.78)',
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
    // "Track info" item routes to Apple Music. If we don't have a
    // direct Apple track URL on the queue entry, fall back to a
    // title/artist search URL so the menu item still does something
    // useful instead of sitting greyed-out (the previous behavior).
    const link = appleUrl
      ?? (title || artist
            ? `https://music.apple.com/search?term=${encodeURIComponent(`${title ?? ''} ${artist ?? ''}`.trim())}`
            : '');
    setOpen(false);
    if (link) openAppleMusic(link);
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
          transition: `background ${DUR.hover}ms ${EASE.smooth}`,
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
            // Anchored ABOVE the button (NowPlayingBar lives at the
            // viewport bottom, so dropping down would clip), and
            // extending RIGHTWARD from the button's left edge so the
            // menu appears to the right of the click point. left:-4
            // softly overhangs the button so the corner reads as
            // attached. If the menu would overflow the viewport on
            // the right, the small 8 px viewport-edge guard via
            // maxWidth keeps it readable rather than clipping items.
            bottom: 'calc(100% + 8px)',
            left: -4,
            minWidth: 180,
            maxWidth: 'calc(100vw - 16px)',
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
            // Match the Share row's enabled-condition: as long as we
            // have ANY identifier (direct Apple URL, or just a title /
            // artist to search for), the item is actionable. Was
            // strictly `!appleUrl`, which left it greyed-out for
            // every queue entry that didn't carry an explicit deep
            // link — i.e. most of them.
            disabled={!appleUrl && !title && !artist}
            menuInk={menuInk} hover={hover}
          />
          <MenuItem
            icon={<Share2 size={14} strokeWidth={2.2} />}
            label={copiedKey === 'share' ? t('player.menu.copied') : t('player.menu.share')}
            onClick={handleShare}
            disabled={!appleUrl && !title && !artist}
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
        transition: `background ${DUR.hover}ms ${EASE.smooth}`,
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
