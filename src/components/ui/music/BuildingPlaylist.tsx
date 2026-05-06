/**
 * Building playlist — pinned tracks only.
 *
 * Why this is My-Playlist-only now
 * --------------------------------
 * Earlier this component bundled "pinned tracks" + "search composer"
 * into one block. Music-app UX research (Feishin, Navidrome,
 * r/spotify "Home feed redesign" thread) flagged two problems with
 * that:
 *
 *   1. Search-composer always-visible eats vertical space the user
 *      isn't using 95% of the time. The composer now lives in
 *      `AddTrackComposer.tsx` as a collapsible.
 *
 *   2. The pinned list deserves to sit ABOVE auto-recommendations,
 *      not below them, because users scan for "their stuff" first.
 *      App.tsx now mounts this above `RecommendedList`.
 *
 * Empty state: when nothing is pinned we render a single dashed slot
 * card with a downward arrow pointing the user to the Recommended
 * section directly below. This is the "directional empty state"
 * pattern from Feishin PR #89 — beats a flat "no tracks yet" because
 * it tells the user what to do next.
 */

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  usePlaylist,
  getTaggerPlaylistName,
} from '../../../lib/music/buildingPlaylist';
import type { CityVibe } from '../../../lib/music/trackTypes';
import type { GenreKey } from '../../../types';
import { GENRE_COLORS } from '../../../data/genres';
import { getFamily } from '../../../lib/music/genreFamily';
import { useT } from '../../../lib/app/i18n';
import { useAuthStore } from '../../../features/auth/useAuthStore';
import { contrastColor } from '../../../lib/ui/contrastColor';
import { FONT, SECTION_HEADER } from '../../../lib/ui/tokens';

type Props = {
  buildingId: string;
  /** City vibe used to seed the cold-start social-proof line so an
   *  empty playlist still feels populated. */
  cityVibe?: CityVibe | null;
  text: string;
  text2: string;
  text3: string;
  divider: string;
  darkMode?: boolean;
  /** Open my-playlist detail (full track list + name editor). */
  onOpenDetail?: (taggerId: string) => void;
};

export function BuildingPlaylist({
  buildingId,
  cityVibe,
  text,
  text2,
  text3,
  divider,
  darkMode = false,
  onOpenDetail,
}: Props) {
  const mode = darkMode ? 'dark' : 'light';
  const t = useT();
  const playlist = usePlaylist(buildingId);
  // "started" = user clicked the CTA but hasn't pinned anything yet.
  // While true we replace the CTA with a dashed placeholder slot
  // pointing down at the search field — visual confirmation that
  // their click landed AND a preview of what will fill this space.
  // Reset whenever the building changes so the next building's empty
  // state starts from the CTA again.
  const [started, setStarted] = useState(false);
  useEffect(() => { setStarted(false); }, [buildingId]);
  const user = useAuthStore((s) => s.user);
  const myId = user?.id ?? 'anonymous';
  const myName = user?.displayName || user?.email || 'Me';

  // Bug fix (2026-05-04): this section is "MY PLAYLIST", so every
  // count / empty-check / genre tally must be scoped to MY pins
  // only. Previously we used `playlist.tracks` (the building-wide
  // list) which meant another curator's single pin would mask my
  // empty state, inflate the section header count, and steal genre
  // statistics. The store keeps one row per (track, tagger) pair —
  // filter by taggerId === me.
  const myTracks = playlist.tracks.filter(
    (tr) => (tr.taggerId ?? 'anonymous') === myId,
  );

  // Summary computation — top genre family + custom playlist name.
  // Same compact pattern as TopTaggerCard rows so the right panel
  // reads as a single design system, not two competing layouts.
  const trackCount = myTracks.length;
  const customName = getTaggerPlaylistName(buildingId, myId);
  const headline = customName || myName;

  let topGenreLabel = '';
  let topGenreColor = '';
  if (trackCount > 0) {
    const counts = new Map<GenreKey, number>();
    for (const tr of myTracks) {
      counts.set(tr.genre, (counts.get(tr.genre) ?? 0) + 1);
    }
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (top) {
      const key = top[0];
      const fam = getFamily(key);
      topGenreLabel = (GENRE_COLORS[key]?.label ?? '').split('/')[0].trim()
        || fam.label;
      topGenreColor = contrastColor(fam.color, mode);
    }
  }

  const initial = headline.trim().charAt(0).toUpperCase() || '?';
  let h = 0;
  for (let i = 0; i < myId.length; i++) h = (h * 31 + myId.charCodeAt(i)) >>> 0;
  const avatarHue = h % 360;

  return (
    <div
      style={{
        // Inter-section spacing comes from FixedQueueSidebar's parent
        // gap (SPACE[4] = 16), so each section starts with a clean 0
        // top margin. Was marginTop:20 → +20 over the parent gap, so
        // MY PLAYLIST sat 36 px from PopularTrackCard while every
        // other section pair sat 16 px apart.
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          // Shared SECTION_HEADER token — same eyebrow spec across
          // TopTaggerCard / PopularTrackCard / MY PLAYLIST so the
          // rail reads as one design system.
          ...SECTION_HEADER,
          color: text2,
          marginBottom: 8,
        }}
      >
        {t('music.myPlaylist')}
      </div>

      {trackCount === 0 && !started && (
        // Empty state — quiet hint copy in place of the previous
        // "Start my playlist" CTA pill. The AddTrackComposer search
        // input sits above this section already, so a button that
        // also pointed there was a redundant second affordance.
        // Replacing it with a single line of body text removes the
        // visual repetition while still telling the user what to do
        // ("곡을 추가해서 첫 플레이리스트를 만드세요").
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: 8,
            paddingBottom: 4,
            color: text2,
            fontSize: 12,
            lineHeight: 1.45,
            letterSpacing: '-0.01em',
            textAlign: 'center',
          }}
        >
          {t('music.emptyHint')}
        </div>
      )}

      {/* Post-CTA placeholder slot — confirms the click landed AND
          previews where the first pinned track will sit. Spec is
          IDENTICAL to the summary card below (28×28 leading thumb,
          gap 10, padding 6/6, radius 6) so the row aligns cleanly
          with TopTaggerCard rank rows + the eventual summary card.
          Only the dashed border + muted ink mark it as a "ghost". */}
      {trackCount === 0 && started && (
        // Post-CTA placeholder — silent. The hint copy + arrow were
        // removed because the search composer actually sits ABOVE
        // this section in the rail (AddTrackComposer renders first,
        // BuildingPlaylist comes later), so a "↓ 아래 검색창에서…"
        // line was both directionally wrong and redundant chrome.
        // The dashed slot alone communicates "your first track will
        // land here". Visible width matches the future summary row.
        <div
          aria-hidden="true"
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 12px 8px 12px',
            borderRadius: 8,
            background: 'transparent',
          }}
        >
          <span
            style={{
              // 36×36 / radius 4 — same thumb size as every other
              // right-rail row (TrackRow, PopularRow, RankRow's
              // PlaylistCover). Was 28×28 / radius 8 — visually
              // smaller than the playlist rows directly below.
              width: 36, height: 36, borderRadius: 4,
              border: `1.5px dashed ${divider}`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: text3,
              flexShrink: 0,
            }}
          >
            <Plus size={16} strokeWidth={2.4} />
          </span>
          <span style={{
            flex: 1, height: 12,
            borderRadius: 4,
            background: divider,
            opacity: 0.5,
          }} />
        </div>
      )}

      {/* Summary card — same visual family as TopTaggerCard rows so
          MY PLAYLIST and other people's playlists feel parallel. The
          full track list is one click away via onOpenDetail. */}
      {trackCount > 0 && (
        <div
          role={onOpenDetail ? 'button' : undefined}
          tabIndex={onOpenDetail ? 0 : undefined}
          onClick={onOpenDetail ? () => onOpenDetail(myId) : undefined}
          onKeyDown={(e) => {
            if (!onOpenDetail) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenDetail(myId);
            }
          }}
          aria-label={onOpenDetail ? `Open my playlist (${trackCount} tracks)` : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 12px 8px 12px', borderRadius: 8,
            background: 'transparent',
            cursor: onOpenDetail ? 'pointer' : 'default',
            transition: 'background 150ms ease',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            if (onOpenDetail) e.currentTarget.style.background = 'rgba(14,14,26,0.05)';
          }}
          onMouseLeave={(e) => {
            if (onOpenDetail) e.currentTarget.style.background = 'transparent';
          }}
        >
          {/* Initial-letter monogram tile — square (rounded-corner) for
              consistency with album-art thumbnails throughout the panel. */}
          <span
            aria-hidden="true"
            style={{
              // 36×36 / radius 4 / borderless — matches every other
              // rail row's thumb (TrackRow artwork, PlaylistCover at
              // size 36). Was 28×28 / radius 8 with hairline border,
              // a smaller and visually boxed-in tile that broke the
              // unified row look.
              width: 36, height: 36, borderRadius: 4,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: `hsl(${avatarHue}, 55%, 70%)`,
              color: '#0e0e1a',
              fontFamily: FONT.ui,
              fontSize: 12, fontWeight: 600,
              flexShrink: 0,
            }}
          >{initial}</span>

          {/* Headline + secondary line */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontSize: 12, fontWeight: 600, color: text,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                lineHeight: 1.2,
              }}
              title={headline}
            >
              {headline}
            </span>
            <span
              style={{
                fontSize: 12, fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                letterSpacing: 0.2,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              {/* Top-genre label removed — was a chromatic chip
                  ("DANCE", "POP" etc.) that broke the rail's
                  monochrome system. The summary now reads as a
                  quiet `N songs` caption matching every other rail
                  metadata line. */}
              <span style={{ color: text3 }}>
                {(trackCount === 1
                  ? t('detail.songCount_one')
                  : t('detail.songCount')
                ).replace('{n}', String(trackCount))}
              </span>
            </span>
          </div>
        </div>
      )}

    </div>
  );
}
