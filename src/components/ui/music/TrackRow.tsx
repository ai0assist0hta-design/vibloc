/**
 * Shared track row — used by RecommendedList AND BuildingPlaylist so
 * the two surfaces look identical (same artwork size, same buttons,
 * same genre coding). The right-side action button morphs between
 * "+ pin", "✓ pinned", and "× remove" via the `rightAction` prop.
 *
 * Visual choices (informed by music-app UX research):
 *   • 3px left accent bar tinted by genre — open-source players like
 *     Navidrome and Cider use left bars instead of color dots because
 *     they scan faster against album art.
 *   • Active-row tint — when this row's preview is currently playing,
 *     the whole row gets a low-alpha background in the genre color so
 *     users don't lose track of "what's playing" in long lists.
 *   • 30×30 button targets — current panel scale; matches existing
 *     refresh button. (Reaching the 44px touch ideal would require a
 *     wider panel, which the layout can't afford.)
 *
 * Stays accessible: real <button> elements, aria-pressed on the play
 * button, aria-label on every action.
 */

import type { RecommendedTrack } from '../../../lib/music/trackTypes';
import { playPreview, usePlayerState } from './PreviewPlayer';

export type RightAction = 'add' | 'pinned' | 'remove';

type Props = {
  track: RecommendedTrack;
  // Parent panel design tokens
  text: string;
  text2: string;
  divider: string;
  /** Which right-side action button to render. */
  rightAction: RightAction;
  onRightAction: () => void;
};

export function TrackRow({
  track: t,
  text,
  text2,
  divider,
  rightAction,
  onRightAction,
}: Props) {
  const player = usePlayerState();
  // Defensive: cached iTunes results from earlier sessions can carry a
  // genre key that's since been removed from GENRE_COLORS (e.g. legacy
  // 'indie' before the Apple-taxonomy migration). Fall back to 'pop'
  // — Apple's default broadcast bucket — instead of crashing the row.
  const isCurrent = player.currentId === t.id && player.isPlaying;

  const rightLabel =
    rightAction === 'remove' ? '×' : rightAction === 'pinned' ? '✓' : '+';
  const rightAria =
    rightAction === 'remove'
      ? 'Remove from playlist'
      : rightAction === 'pinned'
        ? 'Already in playlist'
        : 'Add to playlist';
  const rightActive = rightAction === 'pinned';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        // Subtle highlight while playing — genre color removed per
        // 2026-04-20 simplification.
        background: isCurrent ? 'rgba(26,26,46,0.05)' : 'transparent',
        borderRadius: 6,
        padding: '4px 6px',
        transition: 'background 120ms ease',
      }}
    >
      <img
        src={t.artworkUrl}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        referrerPolicy="no-referrer"
        style={{
          width: 40,
          height: 40,
          borderRadius: 6,
          objectFit: 'cover',
          flexShrink: 0,
          background: divider,
        }}
      />
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
          }}
          title={t.artistName}
        >
          {t.artistName}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onRightAction}
          aria-pressed={rightActive}
          aria-label={rightAria}
          title={rightAria}
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: `1px solid ${rightActive ? c : divider}`,
            background: rightActive ? c + '22' : 'transparent',
            color: rightActive ? c : text2,
            fontSize: rightAction === 'remove' ? 16 : 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'IBM Plex Mono', monospace",
            lineHeight: 1,
          }}
        >
          {rightLabel}
        </button>
        <button
          type="button"
          onClick={() => playPreview(t.id, t.previewUrl)}
          disabled={!t.previewUrl}
          aria-pressed={isCurrent}
          aria-label={isCurrent ? 'Pause preview' : 'Play preview'}
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: `1px solid ${isCurrent ? c : divider}`,
            background: isCurrent ? c + '22' : 'transparent',
            color: isCurrent ? c : text,
            fontSize: 12,
            fontWeight: 700,
            cursor: t.previewUrl ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {isCurrent ? '⏸' : '▶'}
        </button>
      </div>
    </div>
  );
}
