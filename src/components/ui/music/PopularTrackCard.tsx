/**
 * PopularTrackCard — top 3 most-popular TRACKs for this building.
 *
 * Apple Music-style row: artwork (with hover play/pause overlay) +
 * title + artist + small mono stat line. Rank badges removed
 * 2026-04-27 — TOP PICKS reads as a flat list now.
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
        fontSize: 12, fontWeight: 800, letterSpacing: 1.0,
        textTransform: 'uppercase', color: text2, marginBottom: 6,
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
          color: text3, opacity: 0.7, marginLeft: tops.length > 0 ? 0 : 'auto',
          letterSpacing: 0.6, fontSize: 10,
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
  popular, text, text2, text3, divider, isCurrent,
}: {
  popular: ReturnType<typeof useTopTracks>[number];
  text: string;
  text2: string;
  text3: string;
  divider: string;
  isCurrent: boolean;
}) {
  const [hover, setHover] = useState(false);
  const t = popular.track;

  function handleClick() {
    if (!t.previewUrl) return;
    playPreview(t.id, t.previewUrl, {
      title: t.trackName,
      artist: t.artistName,
      artworkUrl: t.artworkUrl || undefined,
      appleUrl: t.trackViewUrl || undefined,
    });
  }

  // Layout matches TrackRow exactly so TOP PICKS and AI 추천곡 align
  // visually as a single grid: 36×36 artwork, identical padding,
  // identical typography. The only TOP-PICKS-only flourish is the
  // ♥ N badge on the secondary line.
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
      aria-label={`${t.trackName} by ${t.artistName}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '5px 6px',
        borderRadius: 6,
        background: isCurrent || hover ? 'rgba(26,26,46,0.05)' : 'transparent',
        transition: 'background 120ms ease',
        cursor: t.previewUrl ? 'pointer' : 'default',
        outline: 'none',
      }}
    >
      <span style={{
        position: 'relative',
        width: 36, height: 36, borderRadius: 5,
        flexShrink: 0,
        background: divider,
        overflow: 'hidden',
        display: 'inline-block',
      }}>
        <img
          src={t.artworkUrl}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ width: 36, height: 36, objectFit: 'cover', display: 'block' }}
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
            {isCurrent ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
          </span>
        )}
      </span>

      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column', gap: 1,
      }}>
        <div style={{
          fontSize: 13, fontWeight: isCurrent ? 700 : 600, color: text,
          fontFamily: "'IBM Plex Mono', monospace",
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          lineHeight: 1.3,
        }} title={t.trackName}>
          {t.trackName}
        </div>
        <div style={{
          fontSize: 11.5, color: text2,
          fontFamily: "'IBM Plex Mono', monospace",
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
          {/* Inclusion count — "how many playlists pinned this track".
              For 'building' scope this is distinct curators in this
              building; for 'nearby' fallback it's distinct buildings
              this track appears in. Either way: the bigger the number,
              the more it's been "수록". */}
          <span style={{ color: text3, opacity: 0.6 }}>·</span>
          <span style={{ color: text3, whiteSpace: 'nowrap', fontWeight: 700 }}>
            수록 {popular.pinCount}회
          </span>
        </div>
      </div>

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
