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

import { ChevronRight, Music2, Repeat, Repeat1, Shuffle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '../../../lib/app/i18n';
import { FONT, SPACE } from '../../../lib/ui/tokens';
import { UpNextPanel } from './UpNextPanel';
import {
  cycleRepeat, setQueue, stopPreview, toggleShuffle, usePlayerState,
} from './PreviewPlayer';

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

const SIDEBAR_W = 280;

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
          color: darkMode ? '#e0e0e8' : '#1a1a2e',
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
  return (
    <aside
      role="complementary"
      aria-label={t('queue.upNext')}
      style={{
        position: 'fixed',
        right: 0, top: 0, bottom: 0,
        width: SIDEBAR_W,
        zIndex: 40,
        background: darkMode ? 'rgba(15,15,20,0.55)' : 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        // No edges. Symmetric to FixedToolSidebar.
        border: 'none',
        boxShadow: 'none',
        display: 'flex', flexDirection: 'column',
        fontFamily: FONT.ui,
        color: ink,
      }}
    >
      {/* Header — Apple Music macOS pattern: shuffle / repeat /
          (clear) action chips on the LEFT, collapse on the RIGHT.
          Visible only when there's an actual queue to act on. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${SPACE[3]}px ${SPACE[3]}px ${SPACE[1]}px`,
        gap: SPACE[2],
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[1] }}>
          {hasQueue && (
            <>
              <RailIconBtn
                onClick={toggleShuffle}
                ariaLabel={t('player.shuffle')}
                active={player.shuffle}
                ink={ink} muted={muted} darkMode={darkMode}
              >
                <Shuffle size={14} strokeWidth={2.2} />
              </RailIconBtn>
              <RailIconBtn
                onClick={cycleRepeat}
                ariaLabel={t('player.repeat')}
                active={player.repeat !== 'off'}
                ink={ink} muted={muted} darkMode={darkMode}
              >
                {player.repeat === 'one'
                  ? <Repeat1 size={14} strokeWidth={2.2} />
                  : <Repeat  size={14} strokeWidth={2.2} />}
              </RailIconBtn>
              <button
                type="button"
                onClick={() => { setQueue([]); stopPreview(); }}
                title={t('queue.clear')}
                aria-label={t('queue.clear')}
                style={{
                  marginLeft: SPACE[1],
                  border: 'none', background: 'transparent',
                  color: muted,
                  fontFamily: FONT.mono,
                  fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  padding: `${SPACE[1]}px ${SPACE[2]}px`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'background 120ms ease, color 120ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = ink;
                  e.currentTarget.style.background = darkMode
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(0,0,0,0.04)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = muted;
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {t('queue.clear')}
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Collapse queue"
          title="Collapse"
          style={{
            width: 28, height: 28, borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: muted,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 120ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = darkMode
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(0,0,0,0.05)';
          }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {/* Scrollable body. */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: `${SPACE[2]}px ${SPACE[4]}px ${SPACE[12]}px`,
        display: 'flex', flexDirection: 'column', gap: SPACE[4],
      }}>
        {showPlaceholder ? (
          <div style={{
            marginTop: SPACE[8],
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: SPACE[3], textAlign: 'center', color: muted,
            padding: `0 ${SPACE[4]}px`,
          }}>
            <Music2 size={32} strokeWidth={1.4} style={{ opacity: 0.5 }} />
            <div style={{
              fontFamily: FONT.mono,
              fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}>
              {t('queue.upNext')}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 220 }}>
              {t('queue.empty')}
            </div>
          </div>
        ) : (
          <>
            {children}
            <UpNextPanel
              text={text}
              text2={text2}
              text3={text3}
              divider={divider}
            />
          </>
        )}
      </div>
    </aside>
  );
}

/** Small pill-shaped icon button for the queue rail header. Apple
 *  Music macOS uses red-tinted toggles here; we use the theme's ink
 *  with a subtle hover/active fill so it harmonizes with the rest of
 *  the rail's chrome rather than introducing a third accent color. */
function RailIconBtn({
  onClick, ariaLabel, active, ink, muted, darkMode, children,
}: {
  onClick: () => void;
  ariaLabel: string;
  active: boolean;
  ink: string;
  muted: string;
  darkMode: boolean;
  children: React.ReactNode;
}) {
  const hover = darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  return (
    <button
      type="button"
      onClick={onClick}
      title={ariaLabel}
      aria-label={ariaLabel}
      aria-pressed={active}
      style={{
        width: 26, height: 26, borderRadius: 999,
        border: 'none',
        background: active ? hover : 'transparent',
        color: active ? ink : muted,
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 120ms ease, color 120ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = hover; e.currentTarget.style.color = ink; }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? hover : 'transparent';
        e.currentTarget.style.color = active ? ink : muted;
      }}
    >
      {children}
    </button>
  );
}
