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

import { useState } from 'react';
import type { CityVibe, RecommendedTrack } from '../../../lib/music/trackTypes';
import { searchTrack } from '../../../lib/music/itunes';
import { usePlaylist } from '../../../lib/music/buildingPlaylist';
import { TrackRow } from './TrackRow';

type Props = {
  buildingId: string;
  vibe: CityVibe | null;
  text: string;
  text2: string;
  text3: string;
  divider: string;
};

export function AddTrackComposer({
  buildingId,
  vibe,
  text,
  text2,
  text3,
  divider,
}: Props) {
  const playlist = usePlaylist(buildingId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecommendedTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

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
      {/* Search-first composer — mood/category chips removed by request.
          Section header sits BELOW the search input so the input is the
          first thing the user sees and reaches for. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
        aria-label="Free-text track search"
        style={{ display: 'flex', gap: 6 }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔎 search song or artist…"
          aria-label="Search for a track to pin"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: `1px solid ${divider}`,
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12,
            color: text,
            fontFamily: "'IBM Plex Mono', monospace",
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          style={{
            background: 'transparent',
            border: `1px solid ${divider}`,
            borderRadius: 10,
            padding: '4px 14px',
            fontSize: 11,
            fontWeight: 700,
            color: text2,
            cursor: searching ? 'wait' : 'pointer',
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: 0.4,
          }}
        >
          {searching ? '…' : 'GO'}
        </button>
      </form>

      {/* "TAG A TRACK" label removed — the search bar above is
          self-explanatory, no extra header needed. */}

      {searched && !searching && results.length === 0 && (
        <div style={{ fontSize: 11, color: text3, padding: '4px 0' }}>
          no results
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
            onRightAction={() =>
              pinned ? playlist.unpin(tr.id) : playlist.pin(tr)
            }
          />
        );
      })}
    </div>
  );
}
