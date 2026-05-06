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
import { useT } from '../../../lib/app/i18n';
import { FONT, SECTION_HEADER } from '../../../lib/ui/tokens';
import { PlaylistCover } from './PlaylistCover';

type Props = {
  buildingId: string;
  text: string;
  text2: string;
  text3: string;
  divider: string;
  onSelect: (taggerId: string) => void;
  /** Optional play handler. When provided, clicking a rank row also
   *  starts playing that playlist (queue seeded from the tagger's
   *  pins). Without it, click only opens the detail view. Apple
   *  Music's library list uses the same dual gesture (single click
   *  selects + plays). */
  onPlay?: (taggerId: string) => void;
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
  buildingId, text, text2, text3, divider, onSelect, onPlay, limit, medals = false,
}: Props) {
  // Apple Music dual-gesture row: row click (label / thumb) opens
  // the detail view, the dedicated ▶ button on hover starts playback
  // without navigating. Splitting the gestures avoids the "I just
  // wanted to peek and audio started" surprise. activate() is kept
  // for keyboard activation only — Enter/Space on the row open
  // detail (no auto-play to mirror Apple Music's keyboard model).
  const openDetail = (taggerId: string) => onSelect(taggerId);
  // `onPlay` prop kept on the public type for future surfaces
  // (wider callouts) that re-introduce the inline Play button. The
  // in-rail row dropped it to free 44 px for the curator name.
  void onPlay;
  const t = useT();
  // Fetch a generous pool; the scroll pane handles the overflow.
  const all = useTopTaggers(buildingId, 50);
  const ranked = limit ? all.slice(0, limit) : all;
  const overflow = !limit && ranked.length > VISIBLE_BEFORE_SCROLL;

  return (
    <div
      style={{
        // Shared section rhythm: gap 8 between header + body.
        // Was gap 6 — synced upward to BuildingPlaylist /
        // PopularTrackCard so every right-rail section breathes
        // identically.
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: FONT.ui,
      }}
      role="list"
      aria-label={t('taggers.ariaLabel')}
    >
      <div style={{
        ...SECTION_HEADER,
        color: text2, marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 8,
        // Right-edge alignment with every other section header /
        // row trailing element in the rail.
        paddingRight: 12,
      }}>
        {t('taggers.sectionTitle')}
        {/* Count badge removed per design pass — the section header
            reads as a clean label without the trailing number. */}
      </div>

      {ranked.length === 0 && (
        <div style={{
          padding: '16px 12px',
          borderRadius: 12,
          border: `1px dashed ${divider}`,
          fontSize: 12,
          color: text2,
          textAlign: 'center',
          letterSpacing: 0.2,
          lineHeight: 1.5,
        }}>
          <div style={{ color: text, fontWeight: 700, marginBottom: 4 }}>
            {t('taggers.empty.title')}
          </div>
          <div style={{ fontSize: 12 }}>
            {t('taggers.empty.body')}
          </div>
        </div>
      )}

      <div
        style={{
          // gap 4 — same row rhythm as PopularTrackCard's TOP PICKS
          // list (post-unification). Tight enough for an Apple Music
          // list feel, loose enough to breathe between 36-px rows.
          display: 'flex', flexDirection: 'column', gap: 4,
          maxHeight: overflow ? SCROLL_MAX_PX : undefined,
          overflowY: overflow ? 'auto' : undefined,
          // paddingRight removed — was 4 px when overflowing to leave
          // gutter for the scrollbar, but the slim global scrollbar
          // (overlay style on this rail) makes that gutter unnecessary
          // and pushes every row 4 px left of every other rail
          // section's right-edge column.
          paddingRight: 0,
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
          <RankRow
            key={g.taggerId}
            label={`Open ${g.taggerName}'s playlist (${g.totalLikes} likes)`}
            onActivate={() => openDetail(g.taggerId)}
          >
            {medalColor && <Medal rank={idx + 1} color={medalColor} />}
            {/* PlaylistCover — same 2×2 track-art mosaic the floating
                TOP PLAYLISTS callout uses, so the in-rail row's
                cover and the hover-panel cover read as the same
                playlist artwork. Was a single-image TaggerThumb
                (avatar OR top-track cover) that diverged from the
                callout and broke the "this is the same playlist"
                visual link when the user moved their cursor between
                the two surfaces. */}
            <PlaylistCover
              customUrl={g.customCoverUrl}
              artworkUrls={g.coverGridUrls}
              fallbackText={g.taggerName}
              size={36}
              radius={5}
              divider={divider}
              text2={text3}
            />

            {/* Playlist name (custom) — bigger headline, curator name
                relegated to the secondary line. */}
            {(() => {
              const customName = getTaggerPlaylistName(buildingId, g.taggerId);
              const headline = customName || g.taggerName;
              return (
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span
                    style={{
                      // 13/600 — matches PopularTrackCard headline so
                      // TOP PLAYLISTS rows and TOP PICKS rows read as
                      // one type system. Was 14/800 (heavier than every
                      // other rail row); the demotion lets the section
                      // header carry the weight instead of every row.
                      // 14 / 600 / -0.01em — synced with TrackRow +
                      // PopularRow headline so all three rail row
                      // families share one title type ladder.
                      fontSize: 12, fontWeight: 500, color: text,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.3,
                      fontFamily: FONT.ui,
                    }}
                    title={headline}
                  >
                    {headline}
                  </span>
                  <span
                    style={{
                      fontSize: 12, fontWeight: 500, color: text2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      letterSpacing: 0.2,
                      lineHeight: 1.3,
                      fontFamily: FONT.ui,
                    }}
                  >
                    {customName ? g.taggerName : <><span style={{ color: text3 }}>@</span>{g.alias}</>}
                  </span>
                </div>
              );
            })()}

            {/* Inline Play button removed — was eating 44 px (32 +
                12 gap) of the row's flex space, causing curator
                names to truncate to "Mei…" / "Ezr…" on a 280 px
                rail. The play action is still reachable via row →
                detail view → Play pill. The `onPlay` prop handler
                stays in the API for future surfaces (e.g. wider
                callout) that have room for the dual-gesture row. */}

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
                // Two-slot trailing column: [icon 32×32] gap 4 [count 32]
                // — geometrically identical to PopularRow's
                // [Ellipsis 32] gap 4 [Plus 32] cluster sitting on
                // the same row in TOP PICKS. Heart's optical center
                // shares the column with Ellipsis (⋯), count's
                // center shares the column with the +/✓ button.
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: 0,
                border: 'none', background: 'transparent',
                color: liked ? '#ff375f' : text3,
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'color 120ms ease, transform 120ms ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.12)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {/* Icon slot — 32×32 center-aligned, shares Ellipsis column. */}
              <span style={{
                width: 32, height: 32,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Heart filled={liked} />
              </span>
              <span
                style={{
                  // 32-wide center slot — shares Plus / Check column.
                  width: 32,
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                  fontFamily: FONT.ui,
                }}
              >
                {g.totalLikes > 0 ? g.totalLikes : ''}
              </span>
            </button>
          </RankRow>
        );
      })}
      </div>
    </div>
  );
}

/** Row wrapper — the parent click area triggers `onActivate` (open
 *  detail). Tracks hover state so the inline ▶ Play button (rendered
 *  via children) can fade in. Apple Music macOS uses the same
 *  pattern: row click selects/peeks, the play affordance only
 *  appears on hover so a quiet "I just want to look" gesture
 *  doesn't accidentally start audio. */
function RankRow({
  label, onActivate, children,
}: {
  label: string;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="listitem"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={label}
      data-hover={hover ? '1' : '0'}
      style={{
        // padding 5px 6px 5px 12px — content edge sits at rail-x=24,
        // matching the LEFT rail's icon column (TopicRow margin 12 +
        // padding 12). Trailing axis preserved by the 6 px right
        // padding shared with every other rail row.
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '4px 12px 4px 12px', borderRadius: 8,
        background: hover ? 'rgba(14,14,26,0.05)' : 'transparent',
        cursor: 'pointer', textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'background 150ms ease',
        outline: 'none',
      }}
    >
      {/* Row-scoped CSS — make the inline ▶ Play button visible on
          hover. Cleaner than manually tracking hover in every child
          since RankRow already owns the hover state. */}
      <style>{`
        [data-row-play-button] { opacity: 0; }
        [data-hover="1"] [data-row-play-button] { opacity: 1; }
      `}</style>
      {children}
    </div>
  );
}

// TaggerThumb (single-image avatar / top-track-cover / monogram
// fallback) and its `thumbImgStyle` helper were retired when TOP
// PLAYLISTS rows switched to <PlaylistCover> 2×2 mosaics — same
// artwork the floating callout uses, so the two surfaces match.
// The hashed-hue monogram fallback now lives inside PlaylistCover.

/** Olympic-style medal pip — gold/silver/bronze depending on rank.
 *  Used by the floating right-side TOP PLAYLISTS callout to mark
 *  rank 1/2/3 at a glance. The number sits inside the ribbon disk. */
function Medal({ rank, color }: { rank: number; color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: '50%',
        background: color,
        color: '#fff',
        fontSize: 12, fontWeight: 900,
        boxShadow: `0 0 0 1.5px #fff, 0 0 0 2.5px ${color}, 0 1px 3px rgba(0,0,0,0.18)`,
        flexShrink: 0,
        fontFamily: FONT.ui,
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
