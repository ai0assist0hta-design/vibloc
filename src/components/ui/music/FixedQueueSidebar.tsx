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

import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../../../lib/app/i18n';
import { FONT } from '../../../lib/ui/tokens';
import { UpNextPanel } from './UpNextPanel';
import { usePlayerState } from './PreviewPlayer';

type Props = {
  text: string;
  text2: string;
  text3: string;
  divider: string;
  darkMode: boolean;
};

const SIDEBAR_W = 280;

export function FixedQueueSidebar({
  text, text2, text3, divider, darkMode,
}: Props) {
  const player = usePlayerState();
  const t = useT();
  // Collapsed state survives across selections so the user's
  // explicit hide preference sticks. Default = open if there's
  // anything in the queue (so first auto-play visibly populates),
  // otherwise hidden so the 3D city is unobstructed.
  const [open, setOpen] = useState(true);

  // Auto-open the rail whenever the queue ROOT changes (= a new
  // building was selected). After that the user's manual collapse
  // is respected until the next building swap.
  const hasQueue = player.queue.length > 0;
  const queueRootId = hasQueue ? player.queue[0].id : null;
  useEffect(() => {
    if (queueRootId) setOpen(true);
  }, [queueRootId]);

  if (!hasQueue) return null;

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
  return (
    <aside
      role="complementary"
      aria-label={t('queue.upNext')}
      style={{
        position: 'fixed',
        right: 0, top: 0, bottom: 0,
        width: SIDEBAR_W,
        zIndex: 40,
        background: darkMode ? 'rgba(15,15,20,0.78)' : 'rgba(255,255,255,0.78)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        borderLeft: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        boxShadow: '-12px 0 36px rgba(0,0,0,0.10)',
        display: 'flex', flexDirection: 'column',
        fontFamily: FONT.ui,
      }}
    >
      {/* Header bar with collapse button */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: darkMode ? '#e0e0e8' : '#1a1a2e',
          fontFamily: FONT.mono,
        }}>
          {t('queue.upNext')}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Collapse queue"
          title="Collapse"
          style={{
            width: 24, height: 24, borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: darkMode ? 'rgba(224,224,232,0.7)' : 'rgba(26,26,46,0.6)',
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = darkMode
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.04)';
          }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronRight size={14} strokeWidth={2.4} />
        </button>
      </div>

      {/* Scrollable queue body — same UpNextPanel used in the
          building-anchored rail's earlier iteration; reusing it
          keeps the row layout in sync between any future surfaces
          that want to show the queue. */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px 12px 80px', // bottom padding clears NowPlayingBar
      }}>
        <UpNextPanel
          text={text}
          text2={text2}
          text3={text3}
          divider={divider}
        />
      </div>
    </aside>
  );
}
