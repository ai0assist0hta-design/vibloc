/**
 * Recommended track list — fetches 5 tracks for the current building
 * via `recommendForBuilding` (mixes filming-location / wikidata-song /
 * named-landmark / city-vibe sources, with a session-wide overlap guard
 * so any two buildings share at most one track) and renders each row
 * via the shared `TrackRow` component.
 *
 * Section ordering note (post-UX rework)
 * --------------------------------------
 * The City Vibe block used to render here as a child. It moved to
 * App.tsx so the panel can lay out the sections in the order users
 * actually scan: City Vibe → My Playlist → Recommended → Add Track.
 * This component is now strictly the algorithmic feed.
 *
 * Design rules (CLAUDE.md §3 STRICT):
 *   • No new colors — uses parent panel tokens + GENRE_COLORS palette.
 *   • IBM Plex Mono only.
 *   • No external links (Walled Garden, §11).
 *   • a11y: real <button> elements with aria-pressed.
 *
 * Failure mode: if the engine returns 0 tracks (rare — fallback path
 * also failed) we show a quiet "no preview available" line so the
 * section never collapses to empty space mid-panel.
 */

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  recommendForBuilding,
  invalidateRecommendation,
  peekRecommendation,
  type RecommendationResult,
} from '../../../lib/music/recommendEngine';
import type { BuildingTag, CityAreaKey } from '../../../lib/geo/osmLoader';
import { TrackRow } from './TrackRow';
import { usePlaylist } from '../../../lib/music/buildingPlaylist';
import { SECTION_HEADER } from '../../../lib/ui/tokens';
import { useT } from '../../../lib/app/i18n';
import { showToast } from '../../../lib/ui/toast';

type Props = {
  area: CityAreaKey;
  /** Building's resolved coordinate (sanitized if available). */
  lat: number;
  lon: number;
  /** Display name of the building, if it has one. */
  buildingName: string | null;
  /** Stable id used as the React effect dependency so the engine
   *  re-runs every time the user picks a different building. */
  buildingId: string;
  /** OSM-derived tenant tags — passed straight to the engine so it
   *  can derive a tenant-aware vibe (Japanese restaurant → city pop,
   *  hotel → lounge, club → techno, etc.). */
  buildingTags?: BuildingTag[];
  // Parent panel design tokens
  text: string;
  text2: string;
  text3: string;
  divider: string;
};

export function RecommendedList({
  area,
  lat,
  lon,
  buildingName,
  buildingId,
  buildingTags,
  text,
  text2,
  text3,
  divider,
}: Props) {
  const t = useT();
  // Synchronous cache peek seeds the initial state so revisiting a
  // building (within the 10 min TTL) renders instantly with no
  // loading spinner. Cold hits still show the spinner via the effect
  // below.
  const [data, setData] = useState<RecommendationResult | null>(
    () => peekRecommendation(area, buildingId),
  );
  const [loading, setLoading] = useState(() => peekRecommendation(area, buildingId) === null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Show-all-by-default per request: progressive-disclosure removed,
  // every recommended track is rendered immediately.
  const playlist = usePlaylist(buildingId);

  useEffect(() => {
    const ctrl = new AbortController();
    const cached = peekRecommendation(area, buildingId);
    if (cached) {
      // Hot path — paint the cached result immediately, no spinner.
      setData(cached);
      setLoading(false);
      return () => ctrl.abort();
    }
    setLoading(true);
    setData(null);
    recommendForBuilding({ area, lat, lon, buildingName, buildingId, buildingTags, signal: ctrl.signal })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setData(res);
      })
      .catch(() => {
        /* never throws but defensive */
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // buildingId rather than lat/lon — the panel may re-render with
    // new sanitized coords, but we don't want to re-fetch for the
    // same building. eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId, area, refreshKey]);

  return (
    <div
      style={{
        // Inter-section spacing handled by parent FixedQueueSidebar
        // (gap 16). marginTop: 20 was double-counting that gap; left
        // RecommendedList sitting 36 px below MY PLAYLIST while every
        // other section pair was 16 px apart.
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Static section header — Top Pick is always visible per
          progressive-disclosure pattern. Refresh re-rolls the picks.
          Right padding 6 px so the ⟳ button's right edge aligns
          with every TrackRow's trailing action below — both end at
          panel-right − 22 ( = body padding 16 + this 6 ). Removes
          the misalignment where the refresh button sat 6 px right
          of the +/✓/✕ column under it. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          paddingRight: 12,
        }}
      >
        <span
          style={{
            ...SECTION_HEADER,
            color: text2,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
            flex: 1,
            textAlign: 'left',
          }}
        >
          {t('music.topPick')}
        </span>
        <button
          type="button"
          onClick={() => {
            // Invalidate the cached pick so the next run re-fans-out
            // to all four sources instead of returning the same list.
            if (!loading) {
              invalidateRecommendation(area, buildingId);
              setRefreshKey((k) => k + 1);
            }
          }}
          aria-label="Refresh recommendations"
          title={t('music.refreshVibe')}
          style={{
            // Icon-only button: no border, no fill — pure glyph that
            // matches the row trailing actions (TrackRow + button).
            // The 28×28 hit area lines up with the action column so
            // the refresh icon sits on the same right-edge axis.
            background: 'transparent',
            border: 'none',
            borderRadius: '50%',
            padding: 0,
            width: 32, height: 32,
            color: text2,
            cursor: loading ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            transition: 'background 120ms ease, color 120ms ease, transform 600ms ease',
            transform: loading ? 'rotate(360deg)' : 'rotate(0deg)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(14,14,26,0.06)';
            e.currentTarget.style.color = text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = text2;
          }}
        >
          <RefreshCw size={16} strokeWidth={2.2} />
        </button>
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: text3, padding: '4px 0' }}>
          {t('music.loadingPlaylist')}
        </div>
      )}

      {!loading && data && data.tracks.length === 0 && (
        <div style={{ fontSize: 12, color: text3, padding: '4px 0' }}>
          {t('music.noPreview')}
        </div>
      )}

      {!loading && data && data.tracks.map((tr) => {
        const pinned = playlist.isPinned(tr.id);
        return (
          <TrackRow
            key={tr.id}
            track={tr}
            text={text}
            text2={text2}
            divider={divider}
            rightAction={pinned ? 'pinned' : 'add'}
            // Already-pinned tap → quiet toast instead of unpin so a
            // single-click accidental removal can't happen on a
            // discovery surface (AI 추천곡). The user can still unpin
            // explicitly from MY PLAYLIST detail.
            onRightAction={() =>
              pinned
                ? showToast(t('track.toast.alreadyAdded'))
                : playlist.pin(tr)
            }
          />
        );
      })}
    </div>
  );
}

