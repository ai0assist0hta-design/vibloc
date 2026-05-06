/**
 * Viewport-fixed queue sidebar.
 *
 * Apple Music macOS pins its "Continue Playing" rail to the right
 * edge of the window — it doesn't chase whatever album you're on.
 * This component does the same for VIBLOC: a narrow rail anchored
 * to the right edge of the viewport that hosts the Up Next queue.
 *
 * Why a separate panel from the building-anchored right floating
 * panel: those two surfaces serve different intents.
 *
 *   - Building-anchored panel = "what's the music context for THIS
 *     building" (Featured / Top playlists / My playlist). Moves
 *     with the building so the visual link is preserved.
 *   - Fixed queue sidebar = "what's coming up next regardless of
 *     where I clicked". Stays put so the user can scrub the queue
 *     without losing their place when they pan the city.
 *
 * Visibility: only mounts when there's something in the queue.
 * Empty state never renders so the 3D city stays unobstructed
 * before the user starts playing.
 */

import { ChevronRight, ListOrdered, Music2, User } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../../../lib/app/i18n';
import { FONT, SECTION_HEADER, SPACE } from '../../../lib/ui/tokens';
import { UpNextPanel } from './UpNextPanel';
import { usePlayerState } from './PreviewPlayer';
import { useAuthStore } from '../../../features/auth/useAuthStore';

type Props = {
  text: string;
  text2: string;
  text3: string;
  divider: string;
  darkMode: boolean;
  /** When set, auto-opens the rail (= a new building was selected).
   *  No content rendering — visit `children` for the actual surface. */
  buildingId: string | null;
  /** Slot for the building's music sections (CityVibe / Search /
   *  TopPlaylists / TopPicks / MyPlaylist / AI 추천곡). Rendered
   *  ABOVE the Up Next queue so the building context surfaces first
   *  and the queue stays as a pinned bottom anchor. */
  children?: ReactNode;
};

/** Resize bounds — 240 keeps the queue rows readable, 560 keeps
 *  enough of the 3D city visible. Default 280 matches the original
 *  fixed width so first-time users see no layout shift. */
const SIDEBAR_DEFAULT_W = 280;
const SIDEBAR_MIN_W = 240;
const SIDEBAR_MAX_W = 560;
const SIDEBAR_W_STORAGE_KEY = 'vibloc.queueSidebar.width';

function loadWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_W;
  try {
    const v = window.localStorage.getItem(SIDEBAR_W_STORAGE_KEY);
    const n = v ? parseInt(v, 10) : NaN;
    if (Number.isFinite(n)) {
      return Math.max(SIDEBAR_MIN_W, Math.min(SIDEBAR_MAX_W, n));
    }
  } catch {
    // localStorage may be disabled (Safari private mode).
  }
  return SIDEBAR_DEFAULT_W;
}

export function FixedQueueSidebar({
  text, text2, text3, divider, darkMode,
  buildingId, children,
}: Props) {
  const player = usePlayerState();
  const t = useT();
  // Collapsed state survives across selections so the user's
  // explicit hide preference sticks. Default = open if there's
  // anything in the queue (so first auto-play visibly populates),
  // otherwise hidden so the 3D city is unobstructed.
  const [open, setOpen] = useState(true);

  // Up Next queue is HIDDEN by default when a detail view (curator
  // playlist or building info) is showing, so the two playlists
  // don't visually compete. The disclosure toggle in the body
  // surfaces it on demand. Resets to collapsed every time the
  // detail view changes (different curator / building).
  const [queueExpanded, setQueueExpanded] = useState(false);
  useEffect(() => { setQueueExpanded(false); }, [buildingId]);

  // ── Drag-to-resize ─────────────────────────────────────────────
  // Width is user-controlled via a thin handle on the LEFT edge of
  // the rail (right-anchored sidebar → drag left = wider). Saved
  // value hydrates synchronously on first render so the page never
  // flashes at default 280 before snapping to the saved width.
  const [width, setWidth] = useState<number>(loadWidth);
  // Live width during drag — avoids React re-render storms while
  // the user is moving the mouse. The actual `width` state is
  // updated on each mousemove via setWidth (acceptable cost since
  // only this aside re-renders), but persistence happens once on
  // mouseup using widthRef so we don't write localStorage 60×/sec.
  const widthRef = useRef(width);
  widthRef.current = width;
  const draggingRef = useRef(false);

  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const moveTo = (clientX: number) => {
      // Right-anchored sidebar: as the cursor moves LEFT, the
      // sidebar grows. width = viewport width − cursor x.
      // Cap to MAX_W and to ~60 % of the viewport so the rail
      // never eats the whole map even on narrow screens.
      const maxAllowed = Math.min(SIDEBAR_MAX_W, Math.floor(window.innerWidth * 0.6));
      const next = Math.max(
        SIDEBAR_MIN_W,
        Math.min(maxAllowed, window.innerWidth - clientX),
      );
      setWidth(next);
    };

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      moveTo(ev.clientX);
    };
    const onTouchMove = (ev: TouchEvent) => {
      if (!draggingRef.current) return;
      const tch = ev.touches[0];
      if (tch) moveTo(tch.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        window.localStorage.setItem(SIDEBAR_W_STORAGE_KEY, String(widthRef.current));
      } catch {
        // ignore persistence failures
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
  }, []);

  // Double-click the handle → snap back to default width. Common
  // pattern in macOS Finder / Mail / Music sidebars.
  const resetWidth = useCallback(() => {
    setWidth(SIDEBAR_DEFAULT_W);
    try {
      window.localStorage.setItem(SIDEBAR_W_STORAGE_KEY, String(SIDEBAR_DEFAULT_W));
    } catch {
      // ignore
    }
  }, []);

  // Auto-open the rail whenever the queue ROOT changes (= a new
  // building was selected) OR a building is freshly selected.
  // After that the user's manual collapse is respected until the
  // next building swap.
  const hasQueue = player.queue.length > 0;
  const queueRootId = hasQueue ? player.queue[0].id : null;
  useEffect(() => {
    if (queueRootId) setOpen(true);
  }, [queueRootId]);
  useEffect(() => {
    if (buildingId) setOpen(true);
  }, [buildingId]);

  // ── Live width broadcast ─────────────────────────────────────
  // Mirrors the LEFT rail: publishes `--vbk-right-rail-w` so the
  // NowPlayingBar (and any other shared surface) can compute its
  // position as `calc(var(--vbk-left-rail-w) + ...)` instead of
  // a hardcoded 280-px assumption. Collapsed → 28-px tab handle.
  useEffect(() => {
    const effective = open ? width : 28;
    document.documentElement.style.setProperty('--vbk-right-rail-w', `${effective}px`);
    return () => {
      document.documentElement.style.removeProperty('--vbk-right-rail-w');
    };
  }, [open, width]);

  // Always mount — even with no queue + no selection, the rail
  // renders a placeholder so the left/right symmetry holds. Apple
  // Music does the same (right rail always present, content swaps
  // between Continue Playing and "Pick a song to start"). Symmetric
  // chrome > sometimes-empty void on one side.
  const showPlaceholder = !hasQueue && !buildingId;

  // ── Closed state: thin tab handle on the right edge. Click → open.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('queue.upNext')}
        title={t('queue.upNext')}
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 40,
          width: 28, height: 96,
          borderTopLeftRadius: 14, borderBottomLeftRadius: 14,
          borderTopRightRadius: 0, borderBottomRightRadius: 0,
          border: 'none',
          background: darkMode ? 'rgba(15,15,20,0.86)' : 'rgba(255,255,255,0.86)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: darkMode ? '#e0e0e8' : '#0e0e1a',
          cursor: 'pointer',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.10)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ChevronRight size={16} strokeWidth={2.4} style={{ transform: 'rotate(180deg)' }} />
      </button>
    );
  }

  // ── Open state: rail at right edge.
  const ink     = darkMode ? '#f5f5f7' : '#0e0e1a';
  const muted   = darkMode ? '#a8a8b3' : '#5a5a66';
  // Surface alpha fades aggressively at full stretch — mirrors LEFT rail:
  //   • Default 280 px → 0.40
  //   • Max 560 px     → 0.02 (basically blur-only, no tint)
  const fadeT = Math.max(0, Math.min(1,
    (width - SIDEBAR_DEFAULT_W) / (SIDEBAR_MAX_W - SIDEBAR_DEFAULT_W)));
  const surfaceAlpha = 0.40 - fadeT * 0.38;
  return (
    <aside
      role="complementary"
      aria-label={t('queue.upNext')}
      style={{
        position: 'fixed',
        right: 0, top: 0, bottom: 0,
        width: width,
        zIndex: 40,
        background: darkMode
          ? `rgba(15,15,20,${surfaceAlpha})`
          : `rgba(255,255,255,${surfaceAlpha})`,
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        border: 'none',
        boxShadow: 'none',
        display: 'flex', flexDirection: 'column',
        fontFamily: FONT.ui,
        color: ink,
        // No transition on width — the drag must feel pixel-tight.
        // Other props can still tween (background on theme flip etc).
        transition: 'background 240ms ease, color 240ms ease',
      }}
    >
      {/* Resize handle — 6 px hit area on the LEFT edge with a 1 px
          visual marker centered inside. Hover + active brighten the
          marker to Apple-blue so the affordance is obvious without
          taking up real estate when idle. Double-click resets to
          the default 280 px (Finder / Music macOS pattern). */}
      <div
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        onDoubleClick={resetWidth}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize queue sidebar"
        aria-valuemin={SIDEBAR_MIN_W}
        aria-valuemax={SIDEBAR_MAX_W}
        aria-valuenow={width}
        style={{
          position: 'absolute',
          left: -3, top: 0, bottom: 0,
          width: 6,
          cursor: 'col-resize',
          background: 'transparent',
          zIndex: 41,
          touchAction: 'none',
        }}
        onMouseEnter={(e) => {
          const marker = e.currentTarget.firstElementChild as HTMLElement | null;
          if (marker) marker.style.background = darkMode ? '#3da4ff' : '#2997ff';
        }}
        onMouseLeave={(e) => {
          const marker = e.currentTarget.firstElementChild as HTMLElement | null;
          if (marker) marker.style.background = darkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)';
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 2, top: '50%',
            transform: 'translateY(-50%)',
            width: 2,
            height: 36,
            borderRadius: 2,
            background: darkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)',
            transition: 'background 160ms ease, height 160ms ease',
            pointerEvents: 'none',
          }}
        />
      </div>
      {/* Header — Profile row + collapse chevron.
          Profile moved here from the left rail (Apple Music macOS
          pattern places the account avatar at the TOP of the right
          rail / sidebar header — matches user expectation that
          "the human" anchors a high-priority corner). Click → /mypage.
          Empty profile slot is hidden when no user is signed in. */}
      {/* Header padding-right 18 — collapse button (28 px wide)
          ends at panel-right − 18, putting its CENTER on the same
          vertical axis (panel-right − 32) as every section
          counter / row trailing element below (TopTaggers count,
          TOP PICKS 3/3, RankRow heart, TrackRow + button). Was 22
          which centered the button 4 px left of the counter
          column; bringing it to 18 unifies the trailing center
          axis across the whole rail. */}
      <div style={{
        // Symmetric 12 px gutters — header content sits between
        // panel-x=12 and panel-right−12, mirroring the LEFT rail
        // (TopicRow has margin 12 on both sides) and the body
        // padding below. Was paddingRight 18 to land the collapse
        // button center on a different trailing axis; the cleaner
        // story is one gutter for the whole panel and the button
        // shifts as part of that grid.
        display: 'flex', alignItems: 'center', gap: SPACE[2],
        padding: `${SPACE[3]}px ${SPACE[3]}px ${SPACE[3]}px ${SPACE[3]}px`,
      }}>
        <ProfileRow ink={ink} muted={muted} hover={darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'} />
        {/* Collapse button removed — the rail can still be hidden
            via the LEFT rail's collapse control / keyboard shortcut.
            Removing it from the header lets the profile row breathe
            and matches Apple Music macOS, which doesn't put a close
            button on the right rail's profile chrome. */}
      </div>

      {/* Scrollable body. When `children` (curator detail / building
          info) is rendered, the Up Next queue is hidden BY DEFAULT
          to avoid the previous "two playlists stacked → user can't
          tell which is which" confusion. A small toggle at the
          bottom lets the user reveal it on demand. When there's no
          children (player rail standalone) the queue renders
          directly since it's the only content. */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        // Grid parity with the LEFT rail's body:
        //   • horizontal 12 (was 16) — same outer gutter as the
        //     left rail's TopicRow margin (12), so content edges
        //     line up vertically across both rails.
        //   • top 8, bottom 12 — same body rhythm.
        // Sections inside this body don't add their own outer
        // margin; the 12 here is the canonical column edge.
        padding: `${SPACE[2]}px ${SPACE[3]}px ${SPACE[3]}px`,
        display: 'flex', flexDirection: 'column', gap: SPACE[4],
      }}>
        {showPlaceholder ? (
          <div style={{
            flex: 1,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: SPACE[2], textAlign: 'center', color: muted,
            padding: `0 ${SPACE[4]}px`,
          }}>
            <Music2 size={36} strokeWidth={1.4} style={{ opacity: 0.5, marginBottom: SPACE[1] }} />
            <div style={SECTION_HEADER}>
              {t('queue.upNext')}
            </div>
            <div style={{
              fontSize: 12, fontWeight: 400, letterSpacing: '-0.01em',
              lineHeight: 1.45, maxWidth: 220,
            }}>
              {t('queue.empty')}
            </div>
          </div>
        ) : children ? (
          // Body holds ONLY the building/curator detail content. The
          // expanded Up Next list is rendered inside the sticky
          // footer below so it visually grows out of the QueueDisclosure
          // button rather than appearing as a detached card up here
          // (prior pattern). This keeps the disclosure as the hinge
          // — list + button read as one expanding panel.
          <>{children}</>
        ) : (
          // No detail view → queue is the rail's only content,
          // render it directly without the disclosure toggle.
          <UpNextPanel
            text={text}
            text2={text2}
            text3={text3}
            divider={divider}
          />
        )}
      </div>

      {/* ── Sticky footer — Up Next disclosure.
          Container is `position: relative` so the expanded queue
          list can be absolutely positioned ABOVE it as an overlay.
          That keeps the body content's layout completely stable
          when the user toggles Up Next: the queue floats over the
          building-detail view instead of pushing it upward.
          The toggle row itself never moves — its padding, position,
          and dimensions are identical in both states. */}
      {children && hasQueue && (
        <div style={{
          position: 'relative',
          borderTop: `1px solid ${divider}`,
          background: 'transparent',
          // Mirror the LEFT rail footer's padding exactly — top 12,
          // L/R 12, bottom 16 — so the Up Next toggle row sits on
          // the SAME Y axis as the LEFT rail's bottom-most row
          // (Language switcher). Was a uniform 12 on all sides
          // which placed Up Next 4 px lower than the Language row.
          padding: `${SPACE[3]}px ${SPACE[3]}px ${SPACE[4]}px`,
          display: 'flex', flexDirection: 'column', gap: 0,
        }}>
          {queueExpanded && (
            <div
              style={{
                // Overlay panel — anchored to the footer's TOP edge,
                // grows UPWARD by sitting in `bottom: 100%` so the
                // toggle row stays exactly where it was. max-height
                // caps at 50vh so very long queues stay scrollable
                // inside the overlay rather than pushing past the
                // viewport's top edge.
                position: 'absolute',
                left: 0, right: 0,
                bottom: '100%',
                maxHeight: '50vh',
                overflowY: 'auto',
                background: darkMode ? 'rgba(20,20,24,0.96)' : 'rgba(255,255,255,0.98)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                borderTop: `1px solid ${divider}`,
                borderBottom: `1px solid ${divider}`,
                boxShadow: darkMode
                  ? '0 -12px 28px rgba(0,0,0,0.32)'
                  : '0 -12px 28px rgba(0,0,0,0.10)',
                padding: `${SPACE[2]}px ${SPACE[3]}px ${SPACE[3]}px`,
                animation: 'vbk-upnext-in 180ms cubic-bezier(0.2, 0.9, 0.3, 1)',
              }}
            >
              <div style={{
                ...SECTION_HEADER,
                color: muted,
                padding: `${SPACE[1]}px 0 ${SPACE[2]}px`,
                display: 'flex', alignItems: 'center',
              }}>
                <span>{t('queue.upNext')}</span>
                <span style={{
                  marginLeft: 'auto',
                  fontVariantNumeric: 'tabular-nums',
                  width: 32, textAlign: 'center',
                }}>
                  {player.queue.length}
                </span>
              </div>
              <UpNextPanel
                text={text}
                text2={text2}
                text3={text3}
                divider={divider}
              />
              <style>{`
                @keyframes vbk-upnext-in {
                  from { opacity: 0; transform: translateY(8px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
              `}</style>
            </div>
          )}
          <QueueDisclosure
            count={player.queue.length}
            expanded={queueExpanded}
            onToggle={() => setQueueExpanded((v) => !v)}
            ink={ink}
            muted={muted}
            divider={divider}
            darkMode={darkMode}
            t={t}
          />
        </div>
      )}
    </aside>
  );
}

/** Inline disclosure toggle that reveals the Up Next queue when a
 *  curator / building detail is occupying the rail. Apple Music's
 *  iPad NowPlaying uses a similar "Up Next" pull-down pattern so
 *  the queue stays one tap away without competing for visual
 *  attention with whatever the user is currently reading. */
function QueueDisclosure({
  count, expanded, onToggle, ink, muted, divider, darkMode, t,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
  ink: string;
  muted: string;
  divider: string;
  darkMode: boolean;
  t: (k: string) => string;
}) {
  const hover = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  // Spec mirrors the LEFT rail's footer ToggleRow (Live mode /
  // Dark mode) so both rails' bottom rows read as the same chrome:
  //   • 12 px label, 400 weight (600 when expanded)
  //   • minHeight 32, padding-Y 8, padding-L 12, padding-R 6
  //   • borderRadius 6 (footer ToggleRow uses 6, not 8)
  //   • no marginTop — the surrounding footer div owns the gap
  //   • icon 14 px (matches the Globe / Moon / Sun icons next door)
  void divider;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      style={{
        // Geometry mirrors the LEFT rail's Globe/Language row exactly:
        // gap 8 (was 12), padding 8 12 8 12, minHeight 32, transparent
        // background. The previous persistent accent bg on `expanded`
        // made this row visually heavier than every other footer row
        // across both rails — the open state is now signaled purely
        // by the bolder font weight + the overlay panel above.
        display: 'flex',
        alignItems: 'center',
        gap: SPACE[2],
        width: '100%',
        padding: `${SPACE[2]}px ${SPACE[3]}px ${SPACE[2]}px ${SPACE[3]}px`,
        borderRadius: 8,
        border: 'none',
        background: 'transparent',
        color: ink,
        fontFamily: FONT.ui,
        fontSize: 12,
        fontWeight: expanded ? 600 : 400,
        letterSpacing: '-0.01em',
        cursor: 'pointer',
        textAlign: 'left',
        minHeight: 32,
        boxSizing: 'border-box',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        width: 24, height: 24, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {/* ListOrdered — semantic "queue is an ordered list" glyph,
            visually distinct from My Blocks's ListMusic on the left
            rail (both icons used to be ListMusic, which read as
            "the same thing" twice). */}
        <ListOrdered size={16} strokeWidth={2.2} />
      </span>
      <span style={{
        flex: 1, minWidth: 0, textAlign: 'left',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {t('queue.upNext')}
      </span>
      {/* Count column — width-locked to 16 px right-aligned to share
          the same right-edge axis as every other panel's parent
          count + child count column (see FixedToolSidebar My Music
          for the canonical pattern). Disclosure chevron removed per
          design pass — open state already signaled by row weight /
          background; the chevron was creating a stack-up at the
          right edge similar to the left rail's removed `.` dot. */}
      <span style={{
        // Width 32 center-aligned — matches the trailing 32×32
        // touch-target buttons across the rail (post HIG bump).
        width: 32, flexShrink: 0,
        fontSize: 12,
        fontWeight: 500,
        color: muted,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'center',
      }}>
        {count}
      </span>
    </button>
  );
}

/* RailTextLink + RailIconBtn helpers removed — the header was
 * simplified to a single collapse chevron, so neither helper has
 * any remaining call site. Re-add when (if) those affordances
 * return. */

/** Profile row at the top of the queue rail. Apple Music macOS
 *  patterns the user identity at the top-right corner of the window
 *  chrome — adapting that here means the profile click target is the
 *  first thing the user sees on the right rail.
 *
 *  • Signed in:  avatar circle with first initial + display name
 *                (or email) — clicking navigates to `/mypage`.
 *  • Signed out: same shape but uses a generic User glyph and links
 *                to `/login` so the row stays a positive call-to-
 *                action instead of disappearing. */
function ProfileRow({
  ink, muted, hover,
}: {
  ink: string;
  muted: string;
  hover: string;
}) {
  const user = useAuthStore((s) => s.user);
  const t = useT();
  const initial = (user?.displayName || user?.email || '').trim().charAt(0).toUpperCase();
  const name = user?.displayName || user?.email || t('nav.login');

  return (
    <Link
      to={user ? '/mypage' : '/login'}
      title={name}
      style={{
        flex: 1, minWidth: 0,
        display: 'inline-flex', alignItems: 'center', gap: 12,
        padding: `${SPACE[1]}px ${SPACE[2]}px`,
        borderRadius: 999,
        textDecoration: 'none',
        color: ink,
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span
        aria-hidden
        style={{
          width: 28, height: 28,
          borderRadius: '50%',
          background: ink,
          color: 'var(--profile-ink-inverse, #ffffff)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONT.ui,
          fontSize: 12, fontWeight: 600,
          letterSpacing: '-0.01em',
          flexShrink: 0,
        }}
      >
        {user && initial ? initial : <User size={16} strokeWidth={2.2} />}
      </span>
      <span style={{
        flex: 1, minWidth: 0,
        fontFamily: FONT.ui,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '-0.01em',
        color: ink,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {name}
      </span>
      {/* Disclosure indicator removed — the collapse button on the
          same header row already occupies the right-edge action
          column, and stacking another `.` next to it created two
          competing trailing affordances. The whole Link is
          clickable, so a separate indicator is redundant. */}
    </Link>
  );
}
