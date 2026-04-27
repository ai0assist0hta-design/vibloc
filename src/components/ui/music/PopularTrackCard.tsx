/**
 * PopularTrackCard — top 3 most-popular TRACKs for this building.
 *
 * Apple Music-style row: artwork (with hover play/pause overlay) +
 * title + artist + small mono stat line. The leftmost rank badge
 * matches TopTaggerCard so the right panel reads as one design system.
 *
 * Scope hierarchy applies to the whole list, not per-row:
 *   - 'building' (이 건물) — tracks pinned here, ranked by likes
 *   - 'nearby'   (동·구 fallback) — most-pinned across other buildings
 */

import { useState } from 'react';
import { Play, Pause, MoreHorizontal } from 'lucide-react';
import { useTopTracks } from '../../../lib/music/buildingPlaylist';
import { playPreview, usePlayerState } from './PreviewPlayer';

type Props = {
  buildingId: string;
  text: string;
  text2: string;
  text3: string;
  divider: string;
  darkMode?: boolean;
};

const RANK_COLORS = ['#f5b301', '#b6b6c1', '#c97a4a'] as const;

export function PopularTrackCard({
  buildingId, text, text2, text3, divider,
}: Props) {
  const tops = useTopTracks(buildingId, 3);
  const player = usePlayerState();
  const scope = tops[0]?.scope ?? 'building';
  const buildingCount = tops[0]?.buildingCount ?? 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
        textTransform: 'uppercase', color: text3,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        TOP PICKS
        {tops.length > 0 && (
          <span style={{
            marginLeft: 'auto', letterSpacing: 0.6,
            padding: '1px 6px', borderRadius: 999,
            background: scope === 'building'
              ? 'rgba(34,197,94,0.14)' : 'rgba(99,102,241,0.14)',
            color: scope === 'building' ? '#15803d' : '#4338ca',
            fontSize: 8.5, fontWeight: 800,
            border: scope === 'building'
              ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(99,102,241,0.3)',
          }}>
            {scope === 'building' ? 'BUILDING' : `NEARBY · ${buildingCount}b`}
          </span>
        )}
        <span style={{
          color: text3, opacity: 0.6, marginLeft: tops.length > 0 ? 0 : 'auto',
          letterSpacing: 0.6,
        }}>
          {tops.length}/3
        </span>
      </div>

      {tops.length === 0 ? (
        <div style={{
          padding: '14px 12px', borderRadius: 12,
          border: `1px dashed ${divider}`,
          fontSize: 10.5, color: text2, textAlign: 'center',
          letterSpacing: 0.2, lineHeight: 1.45,
        }}>
          No data yet — pin a track to set the anthem.
        </div>
      ) : (
        tops.map((p, idx) => (
          <PopularRow
            key={`${p.track.id}-${idx}`}
            rank={idx + 1}
            popular={p}
            text={text}
            text2={text2}
            text3={text3}
            divider={divider}
            isCurrent={player.currentId === p.track.id && player.isPlaying}
          />
        ))
      )}
    </div>
  );
}

function PopularRow({
  rank, popular, text, text2, text3, divider, isCurrent,
}: {
  rank: number;
  popular: ReturnType<typeof useTopTracks>[number];
  text: string;
  text2: string;
  text3: string;
  divider: string;
  isCurrent: boolean;
}) {
  const [hover, setHover] = useState(false);
  const t = popular.track;
  const rankColor = RANK_COLORS[rank - 1] ?? RANK_COLORS[2];

  function handleClick() {
    if (t.previewUrl) playPreview(t.id, t.previewUrl);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={`Rank ${rank}: ${t.trackName} by ${t.artistName}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 10px',
        border: `1px solid ${hover ? rankColor + '66' : divider}`,
        borderRadius: 12,
        background: isCurrent || hover ? 'rgba(26,26,46,0.05)' : 'transparent',
        transition: 'background 120ms ease, border-color 150ms ease',
        cursor: t.previewUrl ? 'pointer' : 'default',
        outline: 'none',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 18, height: 18, borderRadius: '50%',
          background: rankColor,
          color: '#fff',
          fontSize: 10, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {rank}
      </div>

      {/* Artwork + hover play overlay */}
      <span style={{
        position: 'relative',
        width: 40, height: 40, borderRadius: 6,
        flexShrink: 0,
        background: divider,
        overflow: 'hidden',
        display: 'inline-block',
      }}>
        <img
          src={t.artworkUrl}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ width: 40, height: 40, objectFit: 'cover', display: 'block' }}
        />
        {(hover || isCurrent) && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.45)',
              color: '#fff',
              pointerEvents: 'none',
            }}
          >
            {isCurrent ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
          </span>
        )}
      </span>

      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        <div style={{
          fontSize: 12.5, fontWeight: 700, color: text,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          lineHeight: 1.3,
        }} title={t.trackName}>
          {t.trackName}
        </div>
        {/* Single-line "Artist · ♥ N" — Apple Music compact pattern.
            Pin/genre/scope dropped from the row to clear visual noise. */}
        <div style={{
          fontSize: 10.5, color: text2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          lineHeight: 1.3,
          display: 'flex', alignItems: 'center', gap: 6,
        }} title={t.artistName}>
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            minWidth: 0, flex: '0 1 auto',
          }}>
            {t.artistName}
          </span>
          {popular.totalLikes > 0 && (
            <>
              <span style={{ color: text3, opacity: 0.6 }}>·</span>
              <span style={{ color: '#ff375f', whiteSpace: 'nowrap' }}>
                ♥ {popular.totalLikes}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Subtle ⋯ — appears on hover, doesn't compete for attention */}
      <span
        aria-hidden="true"
        style={{
          color: text3,
          opacity: hover ? 1 : 0.35,
          display: 'inline-flex',
          transition: 'opacity 120ms ease',
          flexShrink: 0,
        }}
      >
        <MoreHorizontal size={16} strokeWidth={2} />
      </span>
    </div>
  );
}
