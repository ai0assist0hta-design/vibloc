/**
 * PopularTrackCard — top 3 most-popular TRACKs for this building.
 *
 * Distinct from TopTaggerCard (which ranks playlists/curators). This
 * surfaces individual songs with the highest pin/like count so visitors
 * get an immediate "what's the anthem of this place?" hit.
 *
 * Scope hierarchy (per row, but uniform within a single render):
 *   - 'building' (이 건물): tracks pinned to this building, ranked by likes
 *   - 'nearby'   (동·구 fallback): when this building has no pins,
 *     fall back to the most-pinned tracks across other buildings
 *
 * Layout matches TopTaggerCard's rank rows so the right panel reads
 * as one design system: ranked badges 1/2/3 in gold/silver/bronze,
 * artwork as the avatar, title + artist + small genre+stats line.
 */

import { useTopTracks } from '../../../lib/music/buildingPlaylist';
import { GENRE_COLORS } from '../../../data/genres';
import { playPreview, usePlayerState } from './PreviewPlayer';

type Props = {
  buildingId: string;
  text: string;
  text2: string;
  text3: string;
  divider: string;
};

const RANK_COLORS = ['#f5b301', '#b6b6c1', '#c97a4a'] as const; // gold / silver / bronze

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
        tops.map((p, idx) => {
          const t = p.track;
          const c = (GENRE_COLORS[t.genre] ?? GENRE_COLORS.pop).color;
          const isCurrent = player.currentId === t.id && player.isPlaying;
          const rankColor = RANK_COLORS[idx] ?? RANK_COLORS[2];
          return (
            <div
              key={`${t.id}-${idx}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px',
                border: `1px solid ${divider}`,
                borderRadius: 12,
                background: isCurrent ? 'rgba(26,26,46,0.05)' : 'transparent',
                transition: 'background 120ms ease, border-color 150ms ease',
              }}
              onMouseEnter={(e) => {
                if (!isCurrent) e.currentTarget.style.background = 'rgba(26,26,46,0.05)';
                e.currentTarget.style.borderColor = rankColor + '66';
              }}
              onMouseLeave={(e) => {
                if (!isCurrent) e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = divider;
              }}
            >
              {/* Rank badge — same style as TopTaggerCard */}
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
                {idx + 1}
              </div>

              <img
                src={t.artworkUrl}
                alt=""
                width={48}
                height={48}
                loading="lazy"
                referrerPolicy="no-referrer"
                style={{
                  width: 48, height: 48, borderRadius: 8,
                  objectFit: 'cover', flexShrink: 0, background: divider,
                }}
              />
              <div style={{
                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: text,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }} title={t.trackName}>
                  {t.trackName}
                </div>
                <div style={{
                  fontSize: 10.5, color: text2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }} title={t.artistName}>
                  {t.artistName}
                </div>
                <div style={{
                  display: 'flex', gap: 6, alignItems: 'center',
                  fontSize: 9, fontWeight: 700, color: text3, letterSpacing: 0.4,
                  marginTop: 1,
                }}>
                  <span style={{
                    padding: '1px 6px', borderRadius: 999,
                    background: c + '22', color: c,
                    textTransform: 'uppercase',
                  }}>
                    {(GENRE_COLORS[t.genre] ?? GENRE_COLORS.pop).label.split('/')[0].trim()}
                  </span>
                  <span>PIN {p.pinCount}</span>
                  {p.totalLikes > 0 && (
                    <span style={{ color: '#ff375f' }}>LIKE {p.totalLikes}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => playPreview(t.id, t.previewUrl)}
                disabled={!t.previewUrl}
                aria-pressed={isCurrent}
                aria-label={isCurrent ? 'Pause preview' : 'Play preview'}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  border: `1px solid ${isCurrent ? c : divider}`,
                  background: isCurrent ? c + '22' : 'transparent',
                  color: isCurrent ? c : text,
                  fontSize: 14, fontWeight: 700,
                  cursor: t.previewUrl ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'inherit', flexShrink: 0,
                }}
              >
                {isCurrent ? '⏸' : '▶'}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
