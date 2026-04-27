/**
 * Top-Liked Playlists — right panel header (rank 1~3).
 *
 * Shows up to three taggers whose pinned tracks for THIS building have
 * received the most total likes. Each row is clickable → fires
 * `onSelect(taggerId)` so the parent can swap the panel into a detail
 * view of that playlist.
 *
 * Layout per row:
 *   [#1] [◯ avatar] [Name / @alias · Nt]  [❤ N]
 *
 * Hidden when the building has no pinned tracks yet.
 */

import {
  useTopTaggers,
  togglePlaylistLike,
  isPlaylistLikedByMe,
  getTaggerPlaylistName,
  MIN_PLAYLIST_TRACKS,
} from '../../../lib/music/buildingPlaylist';

type Props = {
  buildingId: string;
  text: string;
  text2: string;
  text3: string;
  divider: string;
  onSelect: (taggerId: string) => void;
};

const RANK_COLORS = ['#f5b301', '#b6b6c1', '#c97a4a'] as const; // gold / silver / bronze

export function TopTaggerCard({
  buildingId, text, text2, text3, divider, onSelect,
}: Props) {
  const ranked = useTopTaggers(buildingId, 3);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontFamily: "'IBM Plex Mono', monospace",
      }}
      role="list"
      aria-label="Top-liked playlists for this building"
    >
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
        textTransform: 'uppercase', color: text3, marginBottom: 2,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        TOP PLAYLISTS
        <span style={{ color: text3, opacity: 0.6, marginLeft: 'auto', letterSpacing: 0.6 }}>
          {ranked.length}/3
        </span>
      </div>

      {ranked.length === 0 && (
        <div style={{
          padding: '14px 12px',
          borderRadius: 12,
          border: `1px dashed ${divider}`,
          fontSize: 10.5,
          color: text2,
          textAlign: 'center',
          letterSpacing: 0.2,
          lineHeight: 1.45,
        }}>
          No qualifying playlists yet — pin{' '}
          <span style={{ color: text, fontWeight: 700 }}>
            {MIN_PLAYLIST_TRACKS}+ tracks
          </span>{' '}
          to claim rank&nbsp;#1.
        </div>
      )}

      {ranked.map((g, idx) => {
        const rankColor = RANK_COLORS[idx];
        const liked = isPlaylistLikedByMe(buildingId, g.taggerId);
        // Whole row is clickable → opens detail. Heart pill is a nested
        // button that stops propagation so it adds a like WITHOUT
        // navigating into the playlist.
        return (
          <div
            key={g.taggerId}
            role="listitem"
            tabIndex={0}
            onClick={() => onSelect(g.taggerId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(g.taggerId);
              }
            }}
            aria-label={`Open playlist by ${g.taggerName}, rank ${idx + 1}, ${g.totalLikes} likes`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 12,
              border: `1px solid ${divider}`,
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              transition: 'background 150ms ease, border-color 150ms ease',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.03)';
              e.currentTarget.style.borderColor = rankColor + '66';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = divider;
            }}
          >
            {/* Rank badge */}
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

            {/* HEADZ portrait — pure <img> from a pre-rendered turntable
                frame. Cheap (one image fetch, no Canvas/WebGL) so we
                can show one per row without paying GPU cost. Falls
                back to the seeded base if the user has never opened
                the avatar editor. */}
            <TaggerThumb taggerId={g.taggerId} divider={divider} alt={g.taggerName} />

            {/* Playlist name (custom) — falls back to curator name */}
            {(() => {
              const customName = getTaggerPlaylistName(buildingId, g.taggerId);
              const headline = customName || g.taggerName;
              return (
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 700, color: text,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      letterSpacing: 0.1,
                    }}
                    title={headline}
                  >
                    {headline}
                  </span>
                  <span
                    style={{
                      fontSize: 9, fontWeight: 600, color: text2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      letterSpacing: 0.3,
                    }}
                  >
                    {customName ? (
                      <>{g.taggerName}<span style={{ color: text3, margin: '0 4px' }}>·</span></>
                    ) : (
                      <><span style={{ color: text3 }}>@</span>{g.alias}<span style={{ color: text3, margin: '0 4px' }}>·</span></>
                    )}
                    {g.trackCount}t
                  </span>
                </div>
              );
            })()}

            {/* Like button — clickable heart pill that stops propagation
                so it never triggers the row's open-detail handler. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlaylistLike(buildingId, g.taggerId);
              }}
              aria-pressed={liked}
              aria-label={liked
                ? `Unlike ${g.taggerName}'s playlist`
                : `Like ${g.taggerName}'s playlist`}
              title={liked ? 'Unlike playlist' : 'Like playlist'}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '4px 9px', borderRadius: 999,
                border: `1px solid ${liked ? '#ff375f' : (g.totalLikes > 0 ? '#ff375f44' : divider)}`,
                background: liked
                  ? '#ff375f22'
                  : (g.totalLikes > 0 ? '#ff375f14' : 'transparent'),
                fontSize: 9.5, fontWeight: 700,
                color: liked ? '#ff375f' : (g.totalLikes > 0 ? '#ff375f' : text3),
                flexShrink: 0, letterSpacing: 0.3,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 120ms ease',
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 800 }}>LIKE</span>
              {g.totalLikes}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Initial-letter monogram circle — Slack/Discord style placeholder
 *  for a tagger's avatar. Background hue is derived from the
 *  taggerId so the same user always gets the same color. */
function TaggerThumb({
  taggerId, divider, alt,
}: {
  taggerId: string; divider: string; alt: string;
}) {
  const initial = (alt || taggerId).trim().charAt(0).toUpperCase() || '?';
  let h = 0;
  for (let i = 0; i < taggerId.length; i++) h = (h * 31 + taggerId.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return (
    <span
      aria-label={alt}
      style={{
        width: 28, height: 28, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: `hsl(${hue}, 55%, 70%)`,
        color: '#1a1a2e',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12, fontWeight: 700,
        border: `2px solid ${divider}`,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
        flexShrink: 0,
      }}
    >{initial}</span>
  );
}
