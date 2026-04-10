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
import { usePlaylist } from '../../../lib/music/buildingPlaylist';
import { TrackRow } from './TrackRow';
import type { CityVibe } from '../../../lib/music/trackTypes';
import { GENRE_COLORS } from '../../../data/genres';
import { getFamily } from '../../../lib/music/genreFamily';

const DESCRIPTION_MIN_TRACKS = 2;
const DESCRIPTION_MAX_LEN = 140;

type Props = {
  buildingId: string;
  /** City vibe used to seed the cold-start social-proof line so an
   *  empty playlist still feels populated. */
  cityVibe?: CityVibe | null;
  text: string;
  text2: string;
  text3: string;
  divider: string;
};

/** Deterministic 0..1 hash from a building id — used to fabricate a
 *  stable "N travelers tagged" count without state. */
function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

export function BuildingPlaylist({
  buildingId,
  cityVibe,
  text,
  text2,
  text3,
  divider,
}: Props) {
  const playlist = usePlaylist(buildingId);
  // Local draft state so typing isn't gated by every store re-render.
  // Synced from store on building change OR external mutation.
  const [draftDesc, setDraftDesc] = useState(playlist.description);
  useEffect(() => {
    setDraftDesc(playlist.description);
  }, [buildingId, playlist.description]);

  const showDescription = playlist.tracks.length >= DESCRIPTION_MIN_TRACKS;

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
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: text3,
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        My Playlist {playlist.tracks.length > 0 && `(${playlist.tracks.length})`}
      </div>

      {playlist.tracks.length === 0 && (() => {
        // Curator-seeded social proof (UI/UX research #4 + Letterboxd
        // pattern B.4): an empty playlist now shows a fabricated but
        // deterministic "travelers tagged X here" line plus the city
        // vibe's top-3 genre family chips, so the slot never feels
        // empty. The number is derived from the building id so the
        // same building always reports the same count.
        const seed = seedFromId(buildingId);
        const travelers = 4 + Math.floor(seed * 28); // 4..31
        const topGenres = (cityVibe?.topGenres ?? []).slice(0, 3);
        return (
          <div
            style={{
              border: `1px dashed ${divider}`,
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 11,
              color: text2,
              fontFamily: "'IBM Plex Mono', monospace",
              lineHeight: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden="true">🎧</span>
              <span>
                <strong style={{ color: text }}>{travelers}</strong> travelers
                vibe to this place
              </span>
            </div>
            {topGenres.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {topGenres.map((g) => {
                  const fam = getFamily(g);
                  const short = GENRE_COLORS[g].label.split('/')[0].trim();
                  return (
                    <span
                      key={g}
                      title={`${short} · ${fam.label}`}
                      style={{
                        padding: '3px 9px',
                        borderRadius: 999,
                        background: fam.color + '22',
                        color: fam.color,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                        border: `1px solid ${fam.color}44`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <span aria-hidden="true" style={{ fontSize: 9 }}>{fam.glyph}</span>
                      {short}
                    </span>
                  );
                })}
              </div>
            )}
            <div style={{ fontSize: 10, color: text3, marginTop: 2 }}>
              ↑ tag a track above to make it yours
            </div>
          </div>
        );
      })()}

      {playlist.tracks.map((t) => (
        <TrackRow
          key={t.id}
          track={t}
          text={text}
          text2={text2}
          divider={divider}
          rightAction="remove"
          onRightAction={() => playlist.unpin(t.id)}
        />
      ))}

      {showDescription && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          <textarea
            value={draftDesc}
            onChange={(e) => {
              const v = e.target.value.slice(0, DESCRIPTION_MAX_LEN);
              setDraftDesc(v);
            }}
            onBlur={() => {
              if (draftDesc !== playlist.description) {
                playlist.setDescription(draftDesc);
              }
            }}
            placeholder="describe this playlist… (e.g. 'late-night Itaewon walk')"
            aria-label="Playlist description"
            maxLength={DESCRIPTION_MAX_LEN}
            rows={2}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'transparent',
              border: `1px solid ${divider}`,
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 11,
              lineHeight: 1.5,
              color: text,
              fontFamily: "'IBM Plex Mono', monospace",
              resize: 'none',
              outline: 'none',
            }}
          />
          <div
            style={{
              fontSize: 9,
              color: text3,
              fontFamily: "'IBM Plex Mono', monospace",
              textAlign: 'right',
              letterSpacing: 0.4,
            }}
          >
            {draftDesc.length}/{DESCRIPTION_MAX_LEN}
          </div>
        </div>
      )}
    </div>
  );
}
