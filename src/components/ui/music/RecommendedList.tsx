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
import {
  recommendForBuilding,
  type RecommendationResult,
} from '../../../lib/music/recommendEngine';
import type { BuildingTag, CityAreaKey } from '../../../lib/osmLoader';
import { TrackRow } from './TrackRow';
import { usePlaylist } from '../../../lib/music/buildingPlaylist';

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
  const [data, setData] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  // Progressive disclosure (LogRocket 2024 / aiuxdesign.guide):
  // surface the #1 Top Pick the moment a building is selected so the
  // section never reads as empty, then offer "Show 4 more" to reveal
  // the rest. The iTunes call is cached so always-fetch is cheap.
  // Resets to collapsed-extras on every building change.
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setShowAll(false);
  }, [buildingId]);
  // Top Pick is always visible — the section never fully collapses.
  const open = true;
  const playlist = usePlaylist(buildingId);

  useEffect(() => {
    const ctrl = new AbortController();
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
        marginTop: 4,
        paddingTop: 12,
        borderTop: `1px solid ${divider}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Static section header — Top Pick is always visible per
          progressive-disclosure pattern. Refresh re-rolls the picks. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: text3,
            fontFamily: "'IBM Plex Mono', monospace",
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
            flex: 1,
            textAlign: 'left',
          }}
        >
          AI Top Pick
        </span>
        <button
          type="button"
          onClick={() => {
            if (!loading) setRefreshKey((k) => k + 1);
          }}
          aria-label="Refresh recommendations"
          title="Refresh vibe"
          style={{
            background: 'transparent',
            border: `1px solid ${divider}`,
            borderRadius: 8,
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 700,
            color: text2,
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: "'IBM Plex Mono', monospace",
            display: 'inline-flex',
            alignItems: 'center',
            userSelect: 'none',
          }}
        >
          ⟳
        </button>
      </div>

      {loading && (
        <div style={{ fontSize: 11, color: text3, padding: '4px 0' }}>
          loading playlist…
        </div>
      )}

      {!loading && data && data.tracks.length === 0 && (
        <div style={{ fontSize: 11, color: text3, padding: '4px 0' }}>
          no preview available
        </div>
      )}

      {!loading && data && (() => {
        const visible = showAll ? data.tracks : data.tracks.slice(0, 1);
        const hidden = data.tracks.length - visible.length;
        return (
          <>
            {visible.map((t) => {
              const pinned = playlist.isPinned(t.id);
              return (
                <TrackRow
                  key={t.id}
                  track={t}
                  text={text}
                  text2={text2}
                  divider={divider}
                  rightAction={pinned ? 'pinned' : 'add'}
                  onRightAction={() =>
                    pinned ? playlist.unpin(t.id) : playlist.pin(t)
                  }
                />
              );
            })}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                style={{
                  background: 'transparent',
                  border: `1px dashed ${divider}`,
                  borderRadius: 10,
                  padding: '6px 10px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: text2,
                  cursor: 'pointer',
                  fontFamily: "'IBM Plex Mono', monospace",
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  alignSelf: 'flex-start',
                }}
              >
                Show {hidden} more ▾
              </button>
            )}
            {showAll && data.tracks.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 10,
                  fontWeight: 700,
                  color: text3,
                  cursor: 'pointer',
                  fontFamily: "'IBM Plex Mono', monospace",
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  alignSelf: 'flex-start',
                  padding: 0,
                }}
              >
                show less ▴
              </button>
            )}
          </>
        );
      })()}
    </div>
  );
}

