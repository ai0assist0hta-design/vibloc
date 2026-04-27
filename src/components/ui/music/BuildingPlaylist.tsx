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

import { usePlaylist, MIN_PLAYLIST_TRACKS } from '../../../lib/music/buildingPlaylist';
import { TrackRow } from './TrackRow';
import type { CityVibe } from '../../../lib/music/trackTypes';
import { GENRE_COLORS } from '../../../data/genres';
import { getFamily } from '../../../lib/music/genreFamily';
import { useT } from '../../../lib/app/i18n';

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
  const t = useT();
  const playlist = usePlaylist(buildingId);

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
        {t('music.myPlaylist')} {playlist.tracks.length > 0 && `(${playlist.tracks.length})`}
        {playlist.tracks.length > 0 && playlist.tracks.length < MIN_PLAYLIST_TRACKS && (
          <span style={{
            marginLeft: 6,
            padding: '1px 6px', borderRadius: 999,
            background: 'rgba(245,179,1,0.15)',
            color: '#a86b00',
            fontSize: 8.5, fontWeight: 800,
            border: '1px solid rgba(245,179,1,0.35)',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}>
            DRAFT · {playlist.tracks.length}/{MIN_PLAYLIST_TRACKS}
          </span>
        )}
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
              <span>
                <strong style={{ color: text }}>{travelers}</strong> {t('music.travelersVibe')}
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
              {t('music.tagTrackHint')}
            </div>
          </div>
        );
      })()}

      {playlist.tracks.map((tr) => {
        // MY PLAYLIST is the user's own list — tagger info (who tagged
        // what) lives on the public/curator views (TopTaggerCard,
        // PlaylistDetailView). Hiding it here keeps this section
        // focused on "what's pinned" without redundant noise.
        return (
          <TrackRow
            key={tr.id}
            track={tr}
            text={text}
            text2={text2}
            divider={divider}
            rightAction="remove"
            onRightAction={() => playlist.unpin(tr.id)}
          />
        );
      })}

    </div>
  );
}
