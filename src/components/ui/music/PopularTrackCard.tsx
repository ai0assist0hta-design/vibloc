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
import { Play, Pause, Plus, Check } from 'lucide-react';
import { useTopTracks, usePlaylist } from '../../../lib/music/buildingPlaylist';
import { useT } from '../../../lib/app/i18n';
import { showToast } from '../../../lib/ui/toast';
import { FONT, ROW_CAPTION, SECTION_HEADER } from '../../../lib/ui/tokens';
import { MarqueeText } from './MarqueeText';
import { TrackMoreMenu } from './TrackRow';
import { playPreview, usePlayerState } from './PreviewPlayer';
import { NowPlayingEQ } from './NowPlayingEQ';

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

  return (
    <div style={{
      // Shared section rhythm — gap 8 matches every other rail
      // section so header→body breathing is identical across
      // TopTaggerCard / TOP PICKS / MY PLAYLIST.
      display: 'flex', flexDirection: 'column', gap: 8,
      fontFamily: FONT.ui,
    }}>
      <div style={{
        // Section header now reads from the shared SECTION_HEADER
        // token — was the lone outlier with 800 / 1.2 px tracking,
        // 200 g heavier than every other rail header.
        ...SECTION_HEADER,
        color: text2, marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 8,
        // padding-right 6 so the trailing "3/3" counter ends on the
        // same right-edge column (panel-right − 22) as every other
        // trailing element in the rail (TrackRow action, UpNext
        // count, RecommendedList refresh, RankRow heart).
        paddingRight: 12,
      }}>
        TOP PICKS
        {/* BUILDING / NEARBY scope chip removed — was a noisy
            secondary label competing with the right-edge counter
            for the user's eye. Scope is implied by the data anyway
            (rail surface = current building's playlist). */}
        <span style={{
          color: text3, opacity: 0.7, marginLeft: 'auto',
          letterSpacing: 0.6, fontSize: 12,
          // Width-locked to 28 (same as the row's trailing action
          // button) and center-aligned so the "3/3" counter's
          // optical center sits on the SAME vertical axis as every
          // row's + button below it. Without this both elements
          // ended on the same right edge but had different widths,
          // making their centers ~4 px apart.
          width: 32,
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {tops.length}/3
        </span>
      </div>

      {tops.length === 0 ? (
        <div style={{
          padding: '16px 12px', borderRadius: 12,
          border: `1px dashed ${divider}`,
          fontSize: 12, color: text2, textAlign: 'center',
          letterSpacing: 0.2, lineHeight: 1.45,
        }}>
          No data yet — pin a track to set the anthem.
        </div>
      ) : (
        // Row list — wrapped in its own flex container with gap 4 so
        // TOP PICKS rows share the SAME inter-row rhythm as TOP
        // PLAYLISTS (which uses an identical wrapper). Previously
        // rows inherited the parent's gap-8, doubling the visual
        // distance between adjacent tracks here vs every other rail
        // section.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tops.map((p, idx) => (
            <PopularRow
              key={`${p.track.id}-${idx}`}
              popular={p}
              buildingId={buildingId}
              text={text}
              text2={text2}
              text3={text3}
              divider={divider}
              isCurrent={player.currentId === p.track.id && player.isPlaying}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PopularRow({
  popular, buildingId, text, text2, text3, divider, isCurrent,
}: {
  popular: ReturnType<typeof useTopTracks>[number];
  buildingId: string;
  text: string;
  text2: string;
  text3: string;
  divider: string;
  isCurrent: boolean;
}) {
  const [hover, setHover] = useState(false);
  const tr = useT();
  const t = popular.track;
  // Pin / unpin wiring — same API surface that TrackRow's
  // RecommendedList caller uses, so the button behaves identically
  // (Plus → Check on pin; second click unpins back to Plus).
  const playlist = usePlaylist(buildingId);
  const pinned = playlist.isPinned(t.id);
  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pinned) {
      // The + button flipped to ✓ because the track is already pinned.
      // Tapping it now intentionally does NOT remove the track —
      // accidental removal from a discovery surface (TOP PICKS) is
      // worse than the very explicit unpin gesture available in MY
      // PLAYLIST detail. Instead, surface a quiet toast so the user
      // understands why the tap "didn't work".
      showToast(tr('track.toast.alreadyAdded'));
    } else {
      playlist.pin({
        id: t.id,
        trackName: t.trackName,
        artistName: t.artistName,
        artworkUrl: t.artworkUrl,
        previewUrl: t.previewUrl,
        trackViewUrl: t.trackViewUrl,
        genre: t.genre,
        primaryGenreName: t.primaryGenreName,
      });
    }
  };
  const HoverIcon = pinned ? Check : Plus;
  const actionAria = pinned ? tr('track.action.pinned') : tr('track.action.add');

  function handleClick() {
    if (!t.previewUrl) return;
    playPreview(t.id, t.previewUrl, {
      title: t.trackName,
      artist: t.artistName,
      artworkUrl: t.artworkUrl || undefined,
      appleUrl: t.trackViewUrl || undefined,
      genre: t.genre,
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
        // padding-left 12 — artwork's left edge starts at rail-x=24
        // (12 body gutter + 12 row padding), the same content column
        // as the LEFT rail's TopicRow icon (margin 12 + padding 12).
        // Right padding stays 6 to preserve the trailing axis the
        // +/✓/⋯ cluster shares with every other rail row.
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '4px 12px 4px 12px',
        borderRadius: 8,
        background: isCurrent || hover ? 'rgba(14,14,26,0.05)' : 'transparent',
        transition: 'background 120ms ease',
        cursor: t.previewUrl ? 'pointer' : 'default',
        outline: 'none',
      }}
    >
      <span style={{
        position: 'relative',
        width: 36, height: 36, borderRadius: 4,
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
            {/* When this is the playing track, the artwork overlay
                shows an animated 3-bar EQ on hover-out and a Pause
                glyph on hover (so the user knows clicking pauses).
                For non-current tracks the overlay is the standard
                Play glyph (hover-only). */}
            {isCurrent ? (hover ? <Pause size={16} /> : <NowPlayingEQ size={16} color="#fff" />) : <Play size={16} fill="currentColor" />}
          </span>
        )}
      </span>

      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <MarqueeText text={t.trackName} style={{
          // 14 / 600 — synced with TrackRow's bumped headline so
          // every row across the rail reads in one type ladder.
          fontSize: 12, fontWeight: isCurrent ? 600 : 500, color: text,
          fontFamily: FONT.ui,
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
        }} />
        <div style={{
          // Caption 1 (12) — was 11.5 (sub-pixel), now token-aligned
          // with TopTaggerCard / BuildingPlaylist secondary lines.
          fontSize: 12, color: text2,
          fontFamily: FONT.ui,
          lineHeight: 1.3,
          display: 'flex', alignItems: 'center', gap: 8,
          minWidth: 0,
        }}>
          <MarqueeText text={t.artistName} style={{
            minWidth: 0, flex: '0 1 auto',
          }} />
          {/* Inclusion count ("Pinned Nx") removed — the section
              header already implies popularity (TOP PICKS = most-
              pinned), and the secondary line reads cleaner with
              just the artist name, matching every other rail row
              (TrackRow / RankRow). */}
        </div>
      </div>

      {/* Right cluster — mirrors TrackRow exactly: TrackMoreMenu
          (Apple Music search / Share / etc.) + Plus/Check action
          button (pin / unpin). The previous static MoreHorizontal
          glyph was a no-op visual; replaced with the same paired-
          button pattern that AI 추천곡 (RecommendedList) uses, so
          TOP PICKS rows now offer the same affordances. */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <TrackMoreMenu
          track={t}
          appleUrl={t.trackViewUrl || undefined}
          text={text}
          text2={text2}
          tr={tr}
          rowHover={hover}
        />
        <button
          type="button"
          onClick={handleAction}
          aria-label={actionAria}
          title={actionAria}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: pinned ? text : text2,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: hover || pinned ? 1 : 0.5,
            transition: 'opacity 120ms ease, color 120ms ease, background 120ms ease',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(14,14,26,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <HoverIcon size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
