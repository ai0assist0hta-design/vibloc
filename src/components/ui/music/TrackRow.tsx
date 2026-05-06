/**
 * Track row — Apple Music inspired.
 *
 * Pattern (cribbed from Apple Music's library list, Spotify Now Playing
 * track cards, and YouTube Music's compact view):
 *   ┌────────────────────────────────────────────────────┐
 *   │  ┌──┐  Title (bold)                       ⋯ / + / ×│
 *   │  │▶│  Artist (smaller, secondary)                  │
 *   │  └──┘                                              │
 *   └────────────────────────────────────────────────────┘
 *
 * - 40×40 artwork with a play/pause OVERLAY on hover (no second
 *   button column to compete with the action button).
 * - Two-line title/artist column, IBM Plex Mono kept for visual
 *   consistency with the rest of the panel.
 * - Single right-side action button (add / pinned / remove). No
 *   genre pill, no pin/like counts on the row — those live one
 *   surface deeper (PlaylistDetailView).
 * - Click anywhere on the row also triggers play, so the whole row
 *   is the primary affordance.
 *
 * Stays accessible: the artwork overlay is a real <button>, so
 * keyboard users can Tab to it. aria-pressed mirrors play state.
 */

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Plus, Check, X, MoreHorizontal, Info, Share2 } from 'lucide-react';
import { NowPlayingEQ } from './NowPlayingEQ';
import type { RecommendedTrack } from '../../../lib/music/trackTypes';
import { FONT } from '../../../lib/ui/tokens';
import { useT } from '../../../lib/app/i18n';
import { useDarkMode } from '../../../lib/app/useDarkMode';
import { openAppleMusic } from '../../../lib/share/openAppleMusic';
import { MarqueeText } from './MarqueeText';
import { playPreview, usePlayerState } from './PreviewPlayer';

export type RightAction = 'add' | 'pinned' | 'remove';

type Props = {
  track: RecommendedTrack;
  text: string;
  text2: string;
  divider: string;
  rightAction: RightAction;
  onRightAction: () => void;
  /** When provided AND the row is in `pinned` state, the right-side
   *  ✓ check is replaced with a one-tap "open in Apple Music" pill.
   *  iOS jumps straight to the app via `music://`; everywhere else
   *  opens the canonical URL in a new tab. */
  appleMusicHref?: string;
};


const HOVER_BG = 'rgba(14,14,26,0.05)';

export function TrackRow({
  track: t,
  text,
  text2,
  divider,
  rightAction,
  onRightAction,
  appleMusicHref,
}: Props) {
  // i18n translator — bound to `tr` to avoid shadowing `t` (the
  // track param renamed via `track: t` destructuring above).
  const tr = useT();
  const player = usePlayerState();
  const isCurrent = player.currentId === t.id && player.isPlaying;
  const [hover, setHover] = useState(false);

  // Right-side action icon — explicit + / ✓ / × always (no longer
  // hidden behind a ⋯ rest state, because the new TrackMoreMenu
  // already lives in the left slot of the right cluster). Apple
  // Music's compact rows use the same paired-button pattern.
  const HoverIcon = rightAction === 'remove' ? X
                  : rightAction === 'pinned' ? Check
                  : Plus;
  const rightAria =
    rightAction === 'remove'  ? tr('track.action.remove')
  : rightAction === 'pinned'  ? tr('track.action.pinned')
                              : tr('track.action.add');

  function handleRowClick() {
    if (!t.previewUrl) return;
    playPreview(t.id, t.previewUrl, {
      title: t.trackName,
      artist: t.artistName,
      artworkUrl: t.artworkUrl || undefined,
      appleUrl: t.trackViewUrl || undefined,
      genre: t.genre,
    });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRowClick();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={`${t.trackName} by ${t.artistName}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: isCurrent || hover ? HOVER_BG : 'transparent',
        borderRadius: 8,
        // padding-left 12 lines artwork up with the rail's content
        // column (rail-x=24), matching the LEFT rail's icon column
        // and every other right-rail row (PopularRow / RankRow).
        padding: '4px 12px 4px 12px',
        transition: 'background 120ms ease',
        cursor: t.previewUrl ? 'pointer' : 'default',
        outline: 'none',
      }}
    >
      {/* Artwork + hover play/pause overlay */}
      <span
        style={{
          position: 'relative',
          width: 36, height: 36, borderRadius: 4,
          flexShrink: 0,
          background: divider,
          overflow: 'hidden',
          display: 'inline-block',
        }}
      >
        <img
          src={t.artworkUrl}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{
            width: 36, height: 36,
            objectFit: 'cover',
            display: 'block',
          }}
        />
        {(hover || isCurrent) && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.45)',
              color: '#fff',
              transition: 'opacity 100ms ease',
              pointerEvents: 'none',
            }}
          >
            {isCurrent
              ? (hover ? <Pause size={16} /> : <NowPlayingEQ size={16} color="#fff" />)
              : <Play size={16} fill="currentColor" />}
          </span>
        )}
      </span>

      {/* Title / Artist */}
      <div
        style={{
          minWidth: 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {/* Title + artist as MarqueeText — long names slide on
            hover instead of getting truncated to "…". Container
            still clips so the row layout stays intact when the
            user isn't hovering. */}
        <MarqueeText
          text={t.trackName}
          style={{
            // 14 / 600 — Apple Music macOS row title spec. Bumped
            // from 13 so the title↔hero ladder reads as 17 → 14 → 12
            // (one major jump + one caption step) instead of the
            // previous 17 → 13 → 12 with a perceptually crowded
            // gap at the bottom.
            fontSize: 12, fontWeight: isCurrent ? 600 : 500,
            color: text,
            fontFamily: FONT.ui,
            lineHeight: 1.3,
            letterSpacing: '-0.01em',
          }}
        />
        <MarqueeText
          text={t.artistName}
          style={{
            fontSize: 12,
            color: text2,
            fontFamily: FONT.ui,
            lineHeight: 1.3,
          }}
        />
      </div>

      {/* Right cluster — two icon buttons sharing one column.
          [⋯] opens a Track-info / Share popover (same shape as the
          NowPlayingBar's MoreMenu). [+ / ✓ / ×] is the existing
          add/pinned/remove affordance. Replacing the previous
          "either Apple icon OR action button" branch with a paired
          control gives the user both info AND pin in one place. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <TrackMoreMenu
          track={t}
          appleUrl={appleMusicHref}
          text={text}
          text2={text2}
          tr={tr}
          rowHover={hover}
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRightAction(); }}
          aria-label={rightAria}
          title={rightAria}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: rightAction === 'pinned' ? text : text2,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: hover || rightAction === 'pinned' ? 1 : 0.5,
            transition: 'opacity 120ms ease, color 120ms ease, background 120ms ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(14,14,26,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <HoverIcon size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

/** Compact Track info / Share popover for a track row.
 *
 *  Bug fixes from v1:
 *    1) Popover now renders with `position: fixed` (anchored at the
 *       button's bounding rect) so it ESCAPES the FixedQueueSidebar
 *       body's `overflow-y: auto` clip. Previously the popover for
 *       rows near the bottom of the rail got cut off.
 *    2) Dark-mode aware: popover bg / border / hover follow the
 *       global dark store so the menu doesn't render as a glaring
 *       white box on the dark rail surface.
 *    3) Defensive event handling on every menu interaction
 *       (stopPropagation + preventDefault) so no click ever leaks
 *       to the row's `handleRowClick` (which would start playback). */
export function TrackMoreMenu({
  track, appleUrl, text, text2, tr, rowHover,
}: {
  track: RecommendedTrack;
  appleUrl: string | undefined;
  text: string;
  text2: string;
  tr: (k: string) => string;
  rowHover: boolean;
}) {
  const dark = useDarkMode();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Compute anchor position for the fixed-position menu. Re-runs on
  // open AND on window scroll/resize so the menu stays glued to the
  // button if the user scrolls the rail mid-open.
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      // Position: 4 px below the button, right edge aligned to the
      // button's right edge + 4 px overhang so the corner reads as
      // attached.
      setPos({
        top: Math.round(r.bottom + 4),
        right: Math.max(8, Math.round(window.innerWidth - r.right - 4)),
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Outside-click + Escape dismiss. Listener is registered ONLY
  // while open; the contains() check covers both the trigger button
  // (so toggling doesn't double-fire) and the floating menu (so
  // clicks inside menu items don't dismiss before they run).
  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleInfo(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    // Mirror handleShare's fallback so Track info is never a dead
    // greyed-out item: search by "Title Artist" when no direct
    // Apple URL was passed in.
    const link = appleUrl
      ?? (track.trackName || track.artistName
            ? `https://music.apple.com/search?term=${encodeURIComponent(`${track.trackName ?? ''} ${track.artistName ?? ''}`.trim())}`
            : '');
    if (link) openAppleMusic(link);
  }
  function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const link = appleUrl
      ?? (track.trackName || track.artistName
            ? `https://music.apple.com/search?term=${encodeURIComponent(`${track.trackName ?? ''} ${track.artistName ?? ''}`.trim())}`
            : '');
    if (!link) return;
    try {
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore clipboard failures (Safari iframe etc.)
    }
  }

  // Dark-aware popover surface. Apple Settings spec stops:
  //   light  → near-white card (#fff @ 0.95) on subtle border
  //   dark   → elevated #2c2c2e w/ white-tint border
  const menuBg     = dark ? 'rgba(44,44,46,0.95)' : 'rgba(255,255,255,0.95)';
  const menuBorder = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
  const menuInk    = dark ? '#f5f5f7' : text;
  const menuHover  = dark ? 'rgba(255,255,255,0.08)' : 'rgba(14,14,26,0.06)';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label={tr('player.menu.more')}
        title={tr('player.menu.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: 32, height: 32, borderRadius: '50%',
          border: 'none', background: 'transparent',
          color: text2,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: rowHover || open ? 1 : 0.5,
          transition: 'opacity 120ms ease, background 120ms ease',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = dark
            ? 'rgba(255,255,255,0.10)'
            : 'rgba(14,14,26,0.08)';
        }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <MoreHorizontal size={16} strokeWidth={2.2} />
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            minWidth: 160,
            maxWidth: 'calc(100vw - 16px)',
            padding: 4,
            borderRadius: 12,
            background: menuBg,
            border: `1px solid ${menuBorder}`,
            backdropFilter: 'blur(20px) saturate(140%)',
            WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            boxShadow: dark
              ? '0 12px 32px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.30)'
              : '0 12px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)',
            color: menuInk,
            fontFamily: FONT.ui,
            fontSize: 16,
            zIndex: 1000,
            display: 'flex', flexDirection: 'column',
          }}
        >
          <MenuItem
            icon={<Info size={16} strokeWidth={2.2} />}
            label={tr('player.menu.info')}
            onClick={handleInfo}
            // Enabled as long as we have ANY identifier to search
            // by. The Apple URL becomes a "nice-to-have" — title +
            // artist alone are enough to land on the right Apple
            // Music search page.
            disabled={!appleUrl && !track.trackName && !track.artistName}
            hoverBg={menuHover}
          />
          <MenuItem
            icon={<Share2 size={16} strokeWidth={2.2} />}
            label={copied ? tr('player.menu.copied') : tr('player.menu.share')}
            onClick={handleShare}
            hoverBg={menuHover}
          />
        </div>
      )}
    </>
  );
}

function MenuItem({
  icon, label, onClick, disabled, hoverBg,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  hoverBg: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%',
        padding: '8px 12px',
        borderRadius: 8,
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        fontSize: 16,
        letterSpacing: '-0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        textAlign: 'left',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ display: 'inline-flex', width: 16, justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}
