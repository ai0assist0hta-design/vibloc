/**
 * "Add a Track" composer — always-visible search input.
 *
 * Why always-visible (not collapsible)
 * ------------------------------------
 * The user explicitly flagged music TAGGING (pin-to-building) as the
 * primary workflow, with AI recommendations as secondary. That makes
 * the search composer a primary affordance — gating it behind a
 * collapse would add a click between the user and the action they
 * came here to do. Spicetify's `Better-AddToPlaylist` extension and
 * Audius's inline composer both default-open for the same reason.
 *
 * The composer scopes search to the city's Apple Music store
 * (vibe.country) so a search for "city pop" in Tokyo returns
 * Japanese results, not the global default.
 */

import { useMemo, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import type { CityVibe, RecommendedTrack } from '../../../lib/music/trackTypes';
import { searchTrack } from '../../../lib/music/itunes';
import {
  usePlaylist,
  useTopTaggers,
  getTaggerPlaylistName,
  type TaggerGroup,
} from '../../../lib/music/buildingPlaylist';
import { TrackRow } from './TrackRow';
import { PlaylistCover } from './PlaylistCover';
import { useT } from '../../../lib/app/i18n';
import { showToast } from '../../../lib/ui/toast';
import { ROW_CAPTION, SECTION_HEADER, SPACE } from '../../../lib/ui/tokens';

type Props = {
  buildingId: string;
  vibe: CityVibe | null;
  text: string;
  text2: string;
  text3: string;
  divider: string;
  /** Click handler for a matched playlist result. Wired in App.tsx
   *  to `setDetailTaggerId(taggerId)` so the right rail flips into
   *  PlaylistDetailView for that curator's pinned tracks. */
  onOpenPlaylist?: (taggerId: string) => void;
};

export function AddTrackComposer({
  buildingId,
  vibe,
  text,
  text2,
  text3,
  divider,
  onOpenPlaylist,
}: Props) {
  const playlist = usePlaylist(buildingId);
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecommendedTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  // Live snapshot of every tagger who's pinned a track to this
  // building. Used for the local-first playlist match path so a
  // "@glass.set" / "Rio" query surfaces curator playlists alongside
  // the iTunes track search results.
  const allTaggers = useTopTaggers(buildingId, 100);

  // Derived playlist matches — recomputed any time the query or
  // tagger list changes. Match is substring (case-insensitive)
  // against alias OR display name OR any custom playlist name the
  // curator set; same matching surface a user expects when typing
  // "rio" / "@glass" / "Rio's playlist".
  const playlistMatches = useMemo<TaggerGroup[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // Strip leading "@" so the user can type "@glass.set" or
    // "glass.set" interchangeably.
    const needle = q.startsWith('@') ? q.slice(1) : q;
    if (!needle) return [];
    return allTaggers.filter((g) => {
      const customName = getTaggerPlaylistName(buildingId, g.taggerId).toLowerCase();
      return (
        g.alias.toLowerCase().includes(needle) ||
        g.taggerName.toLowerCase().includes(needle) ||
        customName.includes(needle)
      );
    }).slice(0, 4); // cap at 4 — avoid the playlist block dwarfing the track results
  }, [query, allTaggers, buildingId]);

  const country = vibe?.country ?? 'US';

  async function runSearch(rawQuery?: string) {
    const q = (rawQuery ?? query).trim();
    if (!q) return;
    if (rawQuery !== undefined) setQuery(rawQuery);
    setSearching(true);
    setSearched(true);
    try {
      const r = await searchTrack(q, country, 6);
      setResults(r);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div
      style={{
        // No top border / paddingTop — renders at the very top of the
        // panel, no separator needed above.
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Search-first composer — single inline field with a leading
          search glyph (Apple Music macOS pattern). The "GO" submit
          button was retired: Enter still submits via the form, the
          glyph swaps to a spinner during the request so the loading
          state has a place to land. Removing the button collapses
          the affordance into one column and lets the input stretch
          to the rail's full content width. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
        aria-label="Free-text track search"
        style={{
          position: 'relative',
          display: 'flex',
        }}
      >
        {/* Leading icon — sits inside the input's padding gutter so
            the glyph and the placeholder share one row. Matches the
            rail's other 14-px lucide icons (refresh, queue, search
            bar) for icon-system consistency. */}
        <span
          aria-hidden="true"
          style={{
            // 24×24 icon slot at left:12 — geometrically identical to
            // the LEFT rail TopicRow's leading icon span (margin 12,
            // span 24×24 with a 16-px lucide glyph). That slot is the
            // canonical icon column shared by every rail control.
            position: 'absolute',
            left: 12, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: text3,
            pointerEvents: 'none',
            opacity: searching ? 0.85 : 1,
            transition: 'opacity 120ms ease',
          }}
        >
          {searching
            ? <Loader2 size={16} strokeWidth={2.2} style={{ animation: 'vbk-spin 800ms linear infinite' }} />
            : <Search size={16} strokeWidth={2.2} />}
        </span>
        {/* Spinner keyframes — scoped via <style> so the import
            stays UI-local and we don't pollute the global stylesheet
            with a one-off animation. */}
        <style>{`
          @keyframes vbk-spin { to { transform: rotate(360deg); } }
        `}</style>
        <input
          id="vibloc-add-track-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('music.searchPlaceholder')}
          aria-label={t('music.searchPlaceholder')}
          style={{
            // Geometry locked to the LEFT rail's TopicRow:
            //   • padding 8 12 8 48 — left gutter holds the 12 px
            //     margin + 24 icon + 12 gap that TopicRow uses.
            //   • borderRadius 8 — matches TopicRow (was 10).
            //   • fontSize 13 / -0.01em sans — same as TopicRow label.
            // Height comes from line-height + padding (≈36 px), the
            // same vertical footprint as a TopicRow on the left.
            flex: 1,
            minWidth: 0,
            boxSizing: 'border-box',
            background: 'transparent',
            border: `1px solid ${divider}`,
            borderRadius: 8,
            padding: '8px 12px 8px 48px',
            fontSize: 12,
            letterSpacing: '-0.01em',
            color: text,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </form>

      {/* Results well — bounded scroll area so playlist matches + up
          to 6 track rows + section headers don't push the rest of
          the building panel off screen. The input above stays sticky
          (lives outside this scroller), so the user can keep typing
          without losing context while reviewing matches. maxHeight
          calibrated for ~6 rows + a Playlists section before the
          internal scrollbar kicks in. */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        maxHeight: 360,
        overflowY: 'auto',
      }}>
      {/* Playlist matches — shown ABOVE track results when the query
          fuzz-matches a curator's alias / name / playlist name on
          this building. Apple Music's search surfaces "Top Result"
          + "Songs" sections the same way: identity matches lead so
          a user typing "@glass" lands on the playlist immediately
          without scrolling past 6 song rows. */}
      {playlistMatches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[1] }}>
          <div style={{
            ...SECTION_HEADER,
            color: text3,
            paddingLeft: SPACE[3],
            paddingRight: 12,
          }}>
            {t('music.playlists') || 'Playlists'}
          </div>
          {playlistMatches.map((g) => (
            <PlaylistMatchRow
              key={g.taggerId}
              group={g}
              buildingId={buildingId}
              text={text}
              text3={text3}
              divider={divider}
              onOpen={() => onOpenPlaylist?.(g.taggerId)}
            />
          ))}
        </div>
      )}

      {searched && !searching && results.length === 0 && playlistMatches.length === 0 && (
        <div style={{
          ...ROW_CAPTION,
          color: text3,
          paddingLeft: SPACE[3],
          paddingRight: 12,
        }}>
          {t('music.noResults') || 'no results'}
        </div>
      )}

      {results.length > 0 && playlistMatches.length > 0 && (
        <div style={{
          ...SECTION_HEADER,
          color: text3,
          paddingLeft: SPACE[3],
          paddingRight: 12,
          marginTop: SPACE[1],
        }}>
          {t('music.songs') || 'Songs'}
        </div>
      )}

      {results.map((tr) => {
        const pinned = playlist.isPinned(tr.id);
        return (
          <TrackRow
            key={tr.id}
            track={tr}
            text={text}
            text2={text2}
            divider={divider}
            rightAction={pinned ? 'pinned' : 'add'}
            // Search is the most common surface where the user
            // re-encounters an already-pinned song; a quiet toast
            // explains why the + tap "doesn't do anything" instead
            // of silently removing the track.
            onRightAction={() =>
              pinned
                ? showToast(t('track.toast.alreadyAdded'))
                : playlist.pin(tr)
            }
          />
        );
      })}
      </div>
    </div>
  );
}

/** Compact row that surfaces a curator's playlist when their alias /
 *  name matches the search query. Visual spec mirrors TrackRow: 36-px
 *  cover on the left, two-line meta (playlist name → @alias / curator)
 *  centre, no trailing action (the row itself is the open gesture).
 *  Click → caller routes to the rail's PlaylistDetailView. */
function PlaylistMatchRow({
  group, buildingId, text, text3, divider, onOpen,
}: {
  group: TaggerGroup;
  buildingId: string;
  text: string;
  text3: string;
  divider: string;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  const customName = getTaggerPlaylistName(buildingId, group.taggerId);
  const headline = customName || `${group.taggerName}'s playlist`;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={`Open ${headline}`}
      style={{
        // Same row geometry as TrackRow — 4×12 padding, gap 12,
        // 36 thumb, hover bg — so the playlist row reads as part of
        // the same list system the track results use below.
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '4px 12px 4px 12px',
        borderRadius: 8,
        background: hover ? 'rgba(14,14,26,0.05)' : 'transparent',
        cursor: 'pointer', outline: 'none',
        transition: 'background 120ms ease',
      }}
    >
      <PlaylistCover
        customUrl={group.customCoverUrl}
        artworkUrls={group.coverGridUrls}
        fallbackText={headline}
        size={36}
        radius={5}
        divider={divider}
        text2={text3}
      />
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <span style={{
          // 14 / 600 / -0.01em — same headline spec as every other
          // rail row (TrackRow / PopularRow / RankRow) so the
          // playlist match row reads as part of one list system.
          fontSize: 12, fontWeight: 500, color: text,
          letterSpacing: '-0.01em', lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={headline}>{headline}</span>
        <span style={{
          ...ROW_CAPTION,
          color: text3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          @{group.alias}
          {group.trackCount > 0 ? ` · ${group.trackCount} song${group.trackCount === 1 ? '' : 's'}` : ''}
        </span>
      </div>
    </div>
  );
}
