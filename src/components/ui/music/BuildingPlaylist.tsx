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

import {
  usePlaylist,
  MIN_PLAYLIST_TRACKS,
  getTaggerPlaylistName,
} from '../../../lib/music/buildingPlaylist';
import type { CityVibe } from '../../../lib/music/trackTypes';
import { GENRE_COLORS } from '../../../data/genres';
import { getFamily } from '../../../lib/music/genreFamily';
import { useT } from '../../../lib/app/i18n';
import { useAuthStore } from '../../../features/auth/useAuthStore';
import { contrastColor } from '../../../lib/ui/contrastColor';

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
  darkMode = false,
  onOpenDetail,
}: Props) {
  const mode = darkMode ? 'dark' : 'light';
  const t = useT();
  const playlist = usePlaylist(buildingId);
  const user = useAuthStore((s) => s.user);
  const myId = user?.id ?? 'anonymous';
  const myName = user?.displayName || user?.email || 'Me';

  // Summary computation — top genre family + custom playlist name.
  // Same compact pattern as TopTaggerCard rows so the right panel
  // reads as a single design system, not two competing layouts.
  const trackCount = playlist.tracks.length;
  const customName = getTaggerPlaylistName(buildingId, myId);
  const headline = customName || myName;

  let topGenreLabel = '';
  let topGenreColor = '';
  if (trackCount > 0) {
    const counts = new Map<string, number>();
    for (const tr of playlist.tracks) {
      counts.set(tr.genre, (counts.get(tr.genre) ?? 0) + 1);
    }
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (top) {
      const fam = getFamily(top[0]);
      topGenreLabel = (GENRE_COLORS[top[0]]?.label ?? '').split('/')[0].trim()
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
                        color: contrastColor(fam.color, mode),
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
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 6px', borderRadius: 6,
            background: 'transparent',
            cursor: onOpenDetail ? 'pointer' : 'default',
            transition: 'background 150ms ease',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            if (onOpenDetail) e.currentTarget.style.background = 'rgba(26,26,46,0.05)';
          }}
          onMouseLeave={(e) => {
            if (onOpenDetail) e.currentTarget.style.background = 'transparent';
          }}
        >
          {/* Initial-letter monogram circle — same style as TopTaggerCard */}
          <span
            aria-hidden="true"
            style={{
              width: 28, height: 28, borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: `hsl(${avatarHue}, 55%, 70%)`,
              color: '#1a1a2e',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12, fontWeight: 700,
              border: `2px solid ${divider}`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
              flexShrink: 0,
            }}
          >{initial}</span>

          {/* Headline + secondary line */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontSize: 14, fontWeight: 800, color: text,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                lineHeight: 1.15,
              }}
              title={headline}
            >
              {headline}
            </span>
            <span
              style={{
                fontSize: 10, fontWeight: 600,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                letterSpacing: 0.2,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {topGenreLabel && (
                <span style={{
                  color: topGenreColor,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}>
                  {topGenreLabel}
                </span>
              )}
              <span style={{ color: text3 }}>
                수록곡 {trackCount}곡
              </span>
            </span>
          </div>
        </div>
      )}

    </div>
  );
}
