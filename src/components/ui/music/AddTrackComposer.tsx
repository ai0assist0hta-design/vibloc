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

  // Beli-style mood funnel (IXD@Pratt 2024 critique): one-tap mood
  // chips above the free-text search collapse the cold-start gap.
  // Each chip pre-fills the iTunes query with a curated phrase and
  // immediately runs the search — the user goes from blank state to
  // 5 candidate tracks in a single tap. Free-text search remains as
  // the advanced/escape path below.
  const MOODS: { key: string; label: string; query: string; icon: string }[] = [
    { key: 'chill',     label: 'Chill',     query: 'lo-fi chill beats',     icon: '🌙' },
    { key: 'hype',      label: 'Hype',      query: 'high energy hype',      icon: '⚡' },
    { key: 'romantic',  label: 'Romantic',  query: 'romantic love song',    icon: '💗' },
    { key: 'dark',      label: 'Dark',      query: 'dark moody atmospheric', icon: '🖤' },
    { key: 'nostalgic', label: 'Nostalgic', query: 'nostalgic city pop',    icon: '📼' },
    { key: 'party',     label: 'Party',     query: 'party dance hits',      icon: '🪩' },
  ];

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
        Tag a Track
      </div>

      <div
        role="group"
        aria-label="Mood quick picks"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}
      >
        {MOODS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => void runSearch(m.query)}
            style={{
              padding: '5px 10px',
              borderRadius: 999,
              border: `1px solid ${divider}`,
              background: 'transparent',
              fontSize: 10.5,
              fontWeight: 700,
              color: text2,
              cursor: 'pointer',
              fontFamily: "'IBM Plex Mono', monospace",
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              letterSpacing: 0.3,
            }}
            title={`Search ${m.query}`}
          >
            <span aria-hidden="true">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
        aria-label="Free-text track search"
        style={{ display: 'flex', gap: 6 }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search song or artist…"
          aria-label="Search for a track to pin"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: `1px solid ${divider}`,
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 11,
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
            borderRadius: 8,
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 700,
            color: text2,
            cursor: searching ? 'wait' : 'pointer',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {searching ? '…' : 'Go'}
        </button>
      </form>

      {searched && !searching && results.length === 0 && (
        <div style={{ fontSize: 11, color: text3, padding: '4px 0' }}>
          no results
        </div>
      )}

      {results.map((t) => {
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
    </div>
  );
}
