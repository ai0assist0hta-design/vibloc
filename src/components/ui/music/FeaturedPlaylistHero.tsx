/**
 * FeaturedPlaylistHero — large hero card for the #1 playlist on a
 * building. Mirrors the music-player mockup pattern (Indie Rock Road
 * Trip / The Runner — Foals): big circular cover at the centre, the
 * playlist name above, secondary stats (curator + track count +
 * estimated total time) below.
 *
 * Renders nothing when the building has zero playlists yet.
 */

import { lazy, Suspense, useMemo, useState } from 'react';
import { Share2 } from 'lucide-react';
import {
  useTopTaggers,
  getTaggerPlaylistName,
  getTracksByTagger,
} from '../../../lib/music/buildingPlaylist';
import { PlaylistCover } from './PlaylistCover';

// Modal pulls in lz-string + its own UI. Defer until the user clicks
// share so it never loads on the city map's initial paint.
const PlaylistShareModal = lazy(() =>
  import('./PlaylistShareModal').then((m) => ({ default: m.PlaylistShareModal })),
);

type Props = {
  buildingId: string;
  text: string;
  text2: string;
  text3: string;
  divider: string;
  /** Click → opens PlaylistDetailView for this curator. */
  onSelect?: (taggerId: string) => void;
};

/** iTunes preview URLs are 30 s, but real Apple Music tracks are
 *  ~3:20 on average. Use a safe estimate per track since we don't
 *  store actual durations on PinnedTrack. */
const AVG_TRACK_SECONDS = 200; // 3:20

function fmtMinutes(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export function FeaturedPlaylistHero({
  buildingId, text, text2, text3, divider, onSelect,
}: Props) {
  const ranked = useTopTaggers(buildingId, 1);
  const top = ranked[0] ?? null;

  const tracks = useMemo(
    () => (top ? getTracksByTagger(buildingId, top.taggerId) : []),
    [buildingId, top?.taggerId, top?.trackCount],
  );

  // ⚠ all hooks must be declared before any early-return.
  const [shareOpen, setShareOpen] = useState(false);

  if (!top) return null;

  const customName = getTaggerPlaylistName(buildingId, top.taggerId);
  const headline = customName || top.taggerName;
  const totalSec = tracks.length * AVG_TRACK_SECONDS;

  const interactive = !!onSelect;

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onSelect!(top.taggerId) : undefined}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect!(top.taggerId);
        }
      }}
      aria-label={interactive ? `Open ${headline}` : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        padding: '4px 6px 14px',
        cursor: interactive ? 'pointer' : 'default',
        outline: 'none',
      }}
    >
      {/* Tiny eyebrow — subtle "FEATURED" marker so the user reads
          this as the headline pick, not just decoration. */}
      <div style={{
        display: 'flex', alignItems: 'center',
        alignSelf: 'stretch', marginBottom: 2,
      }}>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9.5, fontWeight: 800, letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: text3,
          }}
        >
          Featured · #1
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShareOpen(true); }}
          aria-label="Share playlist link"
          title="Share link"
          style={{
            marginLeft: 'auto',
            padding: 6, borderRadius: 8,
            border: 'none', background: 'transparent',
            color: text2, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 120ms ease, color 120ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(26,26,46,0.06)';
            e.currentTarget.style.color = text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = text2;
          }}
        >
          <Share2 size={16} strokeWidth={2} />
        </button>
      </div>

      {/* Square cover — custom image when set, else 2×2 mosaic of
          the playlist's top track artworks (Apple Music / Spotify
          "smart cover" pattern), else single artwork, else monogram. */}
      <PlaylistCover
        customUrl={top.customCoverUrl}
        artworkUrls={top.coverGridUrls}
        fallbackText={headline}
        size={160}
        radius={14}
        divider={divider}
        text2={text2}
      />

      {/* Title */}
      <div style={{
        fontSize: 17, fontWeight: 800, color: text,
        letterSpacing: -0.2, lineHeight: 1.2,
        textAlign: 'center',
        maxWidth: 240,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }} title={headline}>
        {headline}
      </div>

      {/* Curator + track count + estimated total time */}
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11, fontWeight: 600, color: text2,
        letterSpacing: 0.4,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {customName && (
          <>
            <span>{top.taggerName}</span>
            <span style={{ color: text3, opacity: 0.6 }}>·</span>
          </>
        )}
        <span>{tracks.length} track{tracks.length === 1 ? '' : 's'}</span>
        {tracks.length > 0 && (
          <>
            <span style={{ color: text3, opacity: 0.6 }}>·</span>
            <span>{fmtMinutes(totalSec)}</span>
          </>
        )}
      </div>
      {shareOpen && (
        <Suspense fallback={null}>
          <PlaylistShareModal
            buildingId={buildingId}
            taggerId={top.taggerId}
            open={shareOpen}
            onClose={() => setShareOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
