/**
 * Top-Liked Playlists — right-panel section.
 *
 * Lists every qualifying tagger for this building, ordered by total
 * likes (desc). The first 5 are visible; anything beyond scrolls in
 * place inside a 320px capped pane (matches the tenant-list pattern
 * — no "더보기" toggle, just scroll).
 *
 * Click a row → opens the detail view for that playlist. The heart
 * pill (right side) is a nested button that stops propagation so it
 * adds a like without navigating.
 */

import { useState } from 'react';
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
  /** Hard cap on rendered rows. Defaults to no cap (full list with
   *  scroll past 5). Used by the floating right-side callout to show
   *  exactly the top 3. */
  limit?: number;
  /** When true, render gold/silver/bronze medal badges next to the
   *  first three rows. Used by the floating right-side callout so
   *  the ranking reads at a glance. The in-panel side rail stays
   *  badgeless (the order itself is enough chrome there). */
  medals?: boolean;
};

const VISIBLE_BEFORE_SCROLL = 5;
const SCROLL_MAX_PX = 320;
const MEDAL_COLORS = ['#f5b301', '#b6b6c1', '#c97a4a'] as const; // gold / silver / bronze

export function TopTaggerCard({
  buildingId, text, text2, text3, divider, onSelect, limit, medals = false,
}: Props) {
  // Fetch a generous pool; the scroll pane handles the overflow.
  const all = useTopTaggers(buildingId, 50);
  const ranked = limit ? all.slice(0, limit) : all;
  const overflow = !limit && ranked.length > VISIBLE_BEFORE_SCROLL;

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
        fontSize: 12, fontWeight: 800, letterSpacing: 1.0,
        textTransform: 'uppercase', color: text2, marginBottom: 6,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        TOP PLAYLISTS
        {ranked.length > 0 && (
          <span style={{ color: text3, opacity: 0.7, marginLeft: 'auto', letterSpacing: 0.6, fontSize: 10 }}>
            {ranked.length}
          </span>
        )}
      </div>

      {ranked.length === 0 && (
        <div style={{
          padding: '14px 12px',
          borderRadius: 12,
          border: `1px dashed ${divider}`,
          fontSize: 11,
          color: text2,
          textAlign: 'center',
          letterSpacing: 0.2,
          lineHeight: 1.5,
        }}>
          <div style={{ color: text, fontWeight: 700, marginBottom: 4 }}>
            Be the first curator here
          </div>
          <div style={{ fontSize: 10.5 }}>
            Search a song below and pin it —<br/>
            it lands at the top of this list.
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 2,
          maxHeight: overflow ? SCROLL_MAX_PX : undefined,
          overflowY: overflow ? 'auto' : undefined,
          paddingRight: overflow ? 4 : 0,
          maskImage: overflow
            ? 'linear-gradient(to bottom, black 92%, transparent)' : undefined,
          WebkitMaskImage: overflow
            ? 'linear-gradient(to bottom, black 92%, transparent)' : undefined,
        }}
      >
      {ranked.map((g, idx) => {
        const liked = isPlaylistLikedByMe(buildingId, g.taggerId);
        const medalColor = medals && idx < 3 ? MEDAL_COLORS[idx] : null;
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
            aria-label={`Open playlist by ${g.taggerName}, ${g.totalLikes} likes`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 6px',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              transition: 'background 150ms ease',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(26,26,46,0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {medalColor && <Medal rank={idx + 1} color={medalColor} />}
            <TaggerThumb
              taggerId={g.taggerId}
              avatarUrl={g.taggerAvatarUrl ?? null}
              coverUrl={g.coverArtworkUrl ?? null}
              divider={divider}
              alt={g.taggerName}
            />

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
                      lineHeight: 1.2,
                    }}
                    title={headline}
                  >
                    {headline}
                  </span>
                  <span
                    style={{
                      fontSize: 11.5, fontWeight: 600, color: text2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      letterSpacing: 0.2,
                    }}
                  >
                    {customName ? g.taggerName : <><span style={{ color: text3 }}>@</span>{g.alias}</>}
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
    </div>
  );
}

/** Tagger avatar thumb. Three-tier fallback chain (Spotify-style):
 *
 *   1. AVATAR — `avatarUrl` set → render as the curator's chosen photo.
 *   2. COVER  — fall back to the playlist's top track artwork
 *              (`coverUrl`). This is the default for seeded curators
 *              and any real user who hasn't uploaded an avatar — it
 *              makes the playlist feel anchored to its sound.
 *   3. MONOGRAM — initial-letter circle with hashed hue, last resort.
 *
 *  Image loads fall back to the next tier on <img> error so a broken
 *  CDN URL never leaves a blank circle. */
function TaggerThumb({
  taggerId, avatarUrl, coverUrl, divider, alt,
}: {
  taggerId: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  divider: string;
  alt: string;
}) {
  let h = 0;
  for (let i = 0; i < taggerId.length; i++) h = (h * 31 + taggerId.charCodeAt(i)) >>> 0;
  const initial = (alt || taggerId).trim().charAt(0).toUpperCase() || '?';
  const hue = h % 360;
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);

  // Tier 1 — curator's chosen photo (real users).
  if (avatarUrl && !avatarBroken) {
    return (
      <img
        src={avatarUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setAvatarBroken(true)}
        style={thumbImgStyle(hue, divider)}
      />
    );
  }
  // Tier 2 — playlist's top-track album cover.
  if (coverUrl && !coverBroken) {
    return (
      <img
        src={coverUrl}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setCoverBroken(true)}
        style={thumbImgStyle(hue, divider)}
      />
    );
  }
  // Tier 3 — initial monogram fallback. Square (rounded-corner)
  // tile for visual consistency with album artwork.
  return (
    <span
      aria-label={alt}
      style={{
        width: 28, height: 28, borderRadius: 6,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: `hsl(${hue}, 55%, 70%)`,
        color: '#1a1a2e',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12, fontWeight: 700,
        border: `1px solid ${divider}`,
        flexShrink: 0,
      }}
    >{initial}</span>
  );
}

function thumbImgStyle(hue: number, divider: string): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 6,
    objectFit: 'cover',
    background: `hsl(${hue}, 55%, 88%)`,
    border: `1px solid ${divider}`,
    flexShrink: 0,
    display: 'block',
  };
}

/** Olympic-style medal pip — gold/silver/bronze depending on rank.
 *  Used by the floating right-side TOP PLAYLISTS callout to mark
 *  rank 1/2/3 at a glance. The number sits inside the ribbon disk. */
function Medal({ rank, color }: { rank: number; color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: '50%',
        background: color,
        color: '#fff',
        fontSize: 11, fontWeight: 900,
        boxShadow: `0 0 0 1.5px #fff, 0 0 0 2.5px ${color}, 0 1px 3px rgba(0,0,0,0.18)`,
        flexShrink: 0,
        fontFamily: "'IBM Plex Mono', monospace",
        letterSpacing: 0,
      }}
    >
      {rank}
    </span>
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
