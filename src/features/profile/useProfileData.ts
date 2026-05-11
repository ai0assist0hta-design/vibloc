/**
 * Profile data aggregator — reads from the building playlist store
 * (localStorage) and computes user-level stats for the MyPage.
 *
 * Pattern reference: Spotify "Your Library" aggregates playlists +
 * recently played; Apple Music "Listen Now" surfaces recent activity.
 * We combine both: per-building playlists (= curated collections)
 * and cross-building stats (total tracks, top genres, recent activity).
 */

import { useEffect, useState } from 'react';
import type { PinnedTrack, BuildingPlaylistEntry } from '@/lib/music/buildingPlaylist';
import type { GenreKey } from '@/types';
import { GENRE_COLORS } from '@/data/genres';

export type ProfilePlaylist = {
  buildingId: string;
  tracks: PinnedTrack[];
  description: string;
  /** Most recent pin timestamp in this playlist */
  lastActivity: number;
};

export type ProfileStats = {
  totalTracks: number;
  totalBuildings: number;
  topGenres: { genre: GenreKey; count: number; color: string; label: string }[];
  recentTracks: (PinnedTrack & { buildingId: string })[];
};

export type ProfileData = {
  playlists: ProfilePlaylist[];
  stats: ProfileStats;
};

const STORAGE_KEY = 'vibloc.playlists.v1';

function loadPlaylists(): ProfilePlaylist[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: ProfilePlaylist[] = [];

    for (const [buildingId, v] of Object.entries(parsed)) {
      let entry: BuildingPlaylistEntry;
      if (Array.isArray(v)) {
        entry = { tracks: v as PinnedTrack[], description: '' };
      } else if (v && typeof v === 'object' && 'tracks' in v) {
        const raw = v as BuildingPlaylistEntry;
        entry = {
          tracks: Array.isArray(raw.tracks) ? raw.tracks : [],
          description: typeof raw.description === 'string' ? raw.description : '',
        };
      } else {
        continue;
      }

      if (entry.tracks.length === 0) continue;

      const lastActivity = Math.max(...entry.tracks.map((t) => t.pinnedAt || 0));
      result.push({ buildingId, tracks: entry.tracks, description: entry.description, lastActivity });
    }

    // Sort by most recent activity
    return result.sort((a, b) => b.lastActivity - a.lastActivity);
  } catch {
    return [];
  }
}

function computeStats(playlists: ProfilePlaylist[]): ProfileStats {
  const allTracks = playlists.flatMap((p) => p.tracks);
  const totalTracks = allTracks.length;
  const totalBuildings = playlists.length;

  // Genre breakdown
  const genreMap = new Map<GenreKey, number>();
  for (const t of allTracks) {
    genreMap.set(t.genre, (genreMap.get(t.genre) ?? 0) + 1);
  }
  const topGenres = Array.from(genreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre, count]) => ({
      genre,
      count,
      color: (GENRE_COLORS[genre] ?? GENRE_COLORS.pop).color,
      label: (GENRE_COLORS[genre] ?? GENRE_COLORS.pop).label,
    }));

  // Recent tracks (across all buildings, sorted by pinnedAt)
  const recentTracks = playlists
    .flatMap((p) => p.tracks.map((t) => ({ ...t, buildingId: p.buildingId })))
    .sort((a, b) => b.pinnedAt - a.pinnedAt)
    .slice(0, 10);

  return { totalTracks, totalBuildings, topGenres, recentTracks };
}

/** React hook that re-reads localStorage on mount + storage events */
export function useProfileData(): ProfileData {
  const [data, setData] = useState<ProfileData>(() => {
    const playlists = loadPlaylists();
    return { playlists, stats: computeStats(playlists) };
  });

  useEffect(() => {
    const refresh = () => {
      const playlists = loadPlaylists();
      setData({ playlists, stats: computeStats(playlists) });
    };

    // Listen for cross-tab storage changes
    window.addEventListener('storage', refresh);
    // Also poll on focus (same-tab changes from map page)
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return data;
}
