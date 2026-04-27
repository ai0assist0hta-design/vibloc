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

            {/* Playlist name (custom) — bigger headline, curator name
                relegated to the secondary line. */}
            {(() => {
              const customName = getTaggerPlaylistName(buildingId, g.taggerId);
              const headline = customName || g.taggerName;
              return (
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span
                    style={{
                      fontSize: 14, fontWeight: 800, color: text,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      letterSpacing: 0,
                      lineHeight: 1.15,
                    }}
                    title={headline}
                  >
                    {headline}
                  </span>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 600, color: text2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      letterSpacing: 0.2,
                    }}
                  >
                    {customName ? (
                      <>{g.taggerName}<span style={{ color: text3, margin: '0 5px' }}>·</span></>
                    ) : (
                      <><span style={{ color: text3 }}>@</span>{g.alias}<span style={{ color: text3, margin: '0 5px' }}>·</span></>
                    )}
                    {g.trackCount}t
                  </span>
                </div>
              );
            })()}

            {/* Like — borderless heart that fills red when liked. */}
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
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: 4, border: 'none', background: 'transparent',
                color: liked ? '#ff375f' : text3,
                fontSize: 11, fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'color 120ms ease, transform 120ms ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.12)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <Heart filled={liked} />
              {g.totalLikes > 0 && (
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{g.totalLikes}</span>
              )}
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

/** Inline SVG heart — outline when not liked, filled red when liked.
 *  No background, no border — pure icon. */
function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path
        d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3 5 6.5 5c1.9 0 3.7 1 5 2.7C12.8 6 14.6 5 16.5 5 20 5 21.8 8.6 20.5 11.8 18.5 16.4 12 21 12 21z"
        fill={filled ? '#ff375f' : 'none'}
        stroke={filled ? '#ff375f' : 'currentColor'}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
