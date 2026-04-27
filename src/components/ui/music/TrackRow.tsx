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

import { useState } from 'react';
import { Play, Pause, Plus, Check, X, MoreHorizontal } from 'lucide-react';
import type { RecommendedTrack } from '../../../lib/music/trackTypes';
import { playPreview, usePlayerState } from './PreviewPlayer';

export type RightAction = 'add' | 'pinned' | 'remove';

type Props = {
  track: RecommendedTrack;
  text: string;
  text2: string;
  divider: string;
  rightAction: RightAction;
  onRightAction: () => void;
};

const HOVER_BG = 'rgba(26,26,46,0.05)';

export function TrackRow({
  track: t,
  text,
  text2,
  divider,
  rightAction,
  onRightAction,
}: Props) {
  const player = usePlayerState();
  const isCurrent = player.currentId === t.id && player.isPlaying;
  const [hover, setHover] = useState(false);

  // Action icon — defaults to a quiet ⋯ on idle. On hover, switches
  // to the explicit Plus / Check / X so the user sees the affordance.
  // Matches the Apple Music compact-row pattern: nothing screams at
  // you until you actually point at it.
  const HoverIcon = rightAction === 'remove' ? X
                  : rightAction === 'pinned' ? Check
                  : Plus;
  const ActionIcon = hover || rightAction === 'pinned' ? HoverIcon : MoreHorizontal;
  const rightAria =
    rightAction === 'remove'  ? 'Remove from playlist'
  : rightAction === 'pinned'  ? 'Already in playlist'
                              : 'Add to playlist';

  function handleRowClick() {
    if (t.previewUrl) playPreview(t.id, t.previewUrl);
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
        gap: 10,
        background: isCurrent || hover ? HOVER_BG : 'transparent',
        borderRadius: 6,
        padding: '5px 6px',
        transition: 'background 120ms ease',
        cursor: t.previewUrl ? 'pointer' : 'default',
        outline: 'none',
      }}
    >
      {/* Artwork + hover play/pause overlay */}
      <span
        style={{
          position: 'relative',
          width: 36, height: 36, borderRadius: 5,
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
            {isCurrent ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
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
          gap: 1,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: isCurrent ? 700 : 600,
            color: text,
            fontFamily: "'IBM Plex Mono', monospace",
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.3,
          }}
          title={t.trackName}
        >
          {t.trackName}
        </div>
        <div
          style={{
            fontSize: 10.5,
            color: text2,
            fontFamily: "'IBM Plex Mono', monospace",
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.3,
          }}
          title={t.artistName}
        >
          {t.artistName}
        </div>
      </div>

      {/* Right action — single icon button, only revealed on hover or
          when in "pinned" steady state, so the row stays clean. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRightAction(); }}
        aria-label={rightAria}
        title={rightAria}
        style={{
          width: 28, height: 28, borderRadius: '50%',
          border: 'none',
          background: 'transparent',
          color: rightAction === 'pinned' ? text : text2,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hover || rightAction === 'pinned' ? 1 : 0.4,
          transition: 'opacity 120ms ease, color 120ms ease, background 120ms ease',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(26,26,46,0.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <ActionIcon size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}
