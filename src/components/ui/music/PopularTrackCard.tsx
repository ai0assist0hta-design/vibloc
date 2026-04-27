/**
 * PopularTrackCard — single most-popular TRACK for this building.
 *
 * Distinct from TopTaggerCard (which ranks playlists/curators). This
 * surfaces ONE song with the highest pin/like count so visitors get an
 * immediate "what's the anthem of this place?" hit.
 *
 * Scope hierarchy
 *   - 'building' (이 건물): track with most likes pinned to this building
 *   - 'nearby'   (동·구 fallback): when this building has no pins, use
 *     the most-pinned track across other buildings
 *
 * Always shown as a section. When no data exists at any scope, renders
 * a placeholder so the card still anchors the panel layout.
 */

import { useTopTrack } from '../../../lib/music/buildingPlaylist';
import { GENRE_COLORS } from '../../../data/genres';
import { playPreview, usePlayerState } from './PreviewPlayer';

type Props = {
  buildingId: string;
  text: string;
  text2: string;
  text3: string;
  divider: string;
};

export function PopularTrackCard({
  buildingId, text, text2, text3, divider,
}: Props) {
  const popular = useTopTrack(buildingId);
  const player = usePlayerState();

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
        {popular && (
          <span style={{
            marginLeft: 'auto', letterSpacing: 0.6,
            padding: '1px 6px', borderRadius: 999,
            background: popular.scope === 'building'
              ? 'rgba(34,197,94,0.14)' : 'rgba(99,102,241,0.14)',
            color: popular.scope === 'building' ? '#15803d' : '#4338ca',
            fontSize: 8.5, fontWeight: 800,
            border: popular.scope === 'building'
              ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(99,102,241,0.3)',
          }}>
            {popular.scope === 'building' ? 'BUILDING' : `NEARBY · ${popular.buildingCount}b`}
          </span>
        )}
      </div>

      {!popular ? (
        <div style={{
          padding: '14px 12px', borderRadius: 12,
          border: `1px dashed ${divider}`,
          fontSize: 10.5, color: text2, textAlign: 'center',
          letterSpacing: 0.2, lineHeight: 1.45,
        }}>
          No data yet — pin a track to set the anthem.
        </div>
      ) : (() => {
        const t = popular.track;
        const c = (GENRE_COLORS[t.genre] ?? GENRE_COLORS.pop).color;
        const isCurrent = player.currentId === t.id && player.isPlaying;
        return (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px',
              border: `1px solid ${divider}`,
              borderRadius: 12,
              background: isCurrent ? 'rgba(26,26,46,0.05)' : 'transparent',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={(e) => {
              if (!isCurrent) e.currentTarget.style.background = 'rgba(26,26,46,0.05)';
            }}
            onMouseLeave={(e) => {
              if (!isCurrent) e.currentTarget.style.background = 'transparent';
            }}
          >
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
                <span>PIN {popular.pinCount}</span>
                {popular.totalLikes > 0 && (
                  <span style={{ color: '#ff375f' }}>LIKE {popular.totalLikes}</span>
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
      })()}
    </div>
  );
}
