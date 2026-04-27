/**
 * Demo data seeder — populates building playlists with fake "agent"
 * taggers so the right-panel UI (TopTaggerCard, PopularTrackCard,
 * tagger cards in BuildingPlaylist) has data to render before any
 * real user has tagged anything.
 *
 * Behavior
 * --------
 *   • Runs ONCE per browser session (dev mode only).
 *   • Reads existing `vibloc.playlists.v1`; only seeds buildings that
 *     have no entry yet → never overwrites real user pins.
 *   • Deterministic: same `buildingId` → same agents/tracks/likes.
 *     This means the demo content stays stable across reloads.
 *
 * Why this lives outside `buildingPlaylist.ts`
 * --------------------------------------------
 * The store module is the production-runtime contract. Demo data
 * generation is a dev-only concern, so it lives here and writes
 * straight to the same localStorage key, then dispatches a 'storage'
 * event so any mounted hooks pick it up.
 */

import type { BuildingPlaylistEntry, PinnedTrack } from '../../lib/music/buildingPlaylist';
import { reloadFromStorage } from '../../lib/music/buildingPlaylist';
import type { RecommendedTrack } from '../../lib/music/trackTypes';

const STORAGE_KEY = 'vibloc.playlists.v1';
const SEED_VERSION_KEY = 'vibloc.demo.seedVersion';
const SEED_VERSION = 'v3-min-3-tracks';
const MAX_SEED_BUILDINGS = 40;

type Agent = {
  id: string;
  name: string;
  avatarUrl: string;
  /** Free-text comment shown on their playlist detail view. */
  note: string;
};

/** Demo curators. Avatars use DiceBear (free, no API key, deterministic
 *  by seed string) so each agent has a distinct circular profile pic. */
const AGENTS: Agent[] = [
  { id: 'agent-luna',  name: 'Luna Park',   avatarUrl: dicebear('luna-park'),  note: '늦은 밤 여기 앞에서 걷다가 머릿속에 박혔던 곡들. 비 오는 날 추천.' },
  { id: 'agent-jiro',  name: 'Jiro Tanaka', avatarUrl: dicebear('jiro-tanaka'),note: 'shinjuku 5am loop. coffee + ambient bass + neon reflections.' },
  { id: 'agent-min',   name: 'Min Seo',     avatarUrl: dicebear('min-seo'),    note: 'k-r&b heavy. 골목길 산책용 셀렉.' },
  { id: 'agent-hugo',  name: 'Hugo Vrai',   avatarUrl: dicebear('hugo-vrai'),  note: 'french touch + city pop crossover. windows down only.' },
  { id: 'agent-ava',   name: 'Ava Chen',    avatarUrl: dicebear('ava-chen'),   note: 'rooftop sunset playlist · indie + dream pop' },
  { id: 'agent-noa',   name: 'Noa Kim',     avatarUrl: dicebear('noa-kim'),    note: '카페에서 아메리카노 한 잔. lo-fi + jazz + 따뜻한 보컬.' },
  { id: 'agent-rio',   name: 'Rio Suzuki',  avatarUrl: dicebear('rio-suzuki'), note: 'morning commute · lofi hiphop · 매일 듣는 셋' },
  { id: 'agent-ezra',  name: 'Ezra Maeda',  avatarUrl: dicebear('ezra-maeda'), note: 'late night drives. synthwave heavy.' },
];

function dicebear(seed: string): string {
  // DiceBear v8 'avataaars' style — colorful, free, no API key, no CORS.
  return `https://api.dicebear.com/8.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

/** Real-ish iTunes track stubs. previewUrl left empty so the play
 *  button shows but stays disabled — keeps the UI honest. Artwork
 *  uses iTunes' public CDN (still hot-linkable). */
const TRACK_POOL: RecommendedTrack[] = [
  mk('1440857781', 'Blinding Lights',         'The Weeknd',         'pop',    'Pop'),
  mk('1440831203', 'Sunflower',               'Post Malone',        'pop',    'Pop'),
  mk('1500401818', 'Dynamite',                'BTS',                'kpop',   'K-Pop'),
  mk('1664031596', 'Cupid',                   'FIFTY FIFTY',        'kpop',   'K-Pop'),
  mk('1592163497', 'Kitsch',                  'IVE',                'kpop',   'K-Pop'),
  mk('1535215575', 'Plastic Love',            'Mariya Takeuchi',    'jpop',   'J-Pop'),
  mk('1440857782', 'Late Night Tales',        'Yebba',              'rnb',    'R&B/Soul'),
  mk('1535215576', 'Stay With Me',            'Miki Matsubara',     'jpop',   'J-Pop'),
  mk('1500401820', 'Lemon',                   'Kenshi Yonezu',      'jpop',   'J-Pop'),
  mk('1440831205', 'Industry Baby',           'Lil Nas X',          'hiphop', 'Hip-Hop/Rap'),
  mk('1440857783', 'God\'s Plan',             'Drake',              'hiphop', 'Hip-Hop/Rap'),
  mk('1500401821', 'Get You',                 'Daniel Caesar',      'rnb',    'R&B/Soul'),
  mk('1500401822', 'Pink + White',            'Frank Ocean',        'rnb',    'R&B/Soul'),
  mk('1664031597', 'After LIKE',              'IVE',                'kpop',   'K-Pop'),
  mk('1535215577', 'Subtitle',                'Official髭男dism',    'jpop',   'J-Pop'),
  mk('1440857784', 'As It Was',               'Harry Styles',       'pop',    'Pop'),
  mk('1500401823', 'Glimpse of Us',           'Joji',               'pop',    'Pop'),
  mk('1500401824', 'Heat Waves',              'Glass Animals',      'alternative', 'Alternative'),
  mk('1440831207', 'Take a Walk',             'Passion Pit',        'alternative', 'Alternative'),
  mk('1500401825', 'Coffee',                  'beabadoobee',        'alternative', 'Alternative'),
  mk('1440857785', 'Lo-fi Beats',             'Idealism',           'electronic', 'Electronic'),
  mk('1500401826', 'Snowman',                 'Sia',                'pop',    'Pop'),
];

function mk(
  id: string, trackName: string, artistName: string,
  genre: RecommendedTrack['genre'], primaryGenreName: string,
): RecommendedTrack {
  // Deterministic placeholder artwork via picsum (seeded by id) so each
  // track gets a stable square image even without an iTunes round-trip.
  return {
    id, trackName, artistName,
    artworkUrl: `https://picsum.photos/seed/${id}/120/120`,
    previewUrl: '',
    primaryGenreName,
    genre,
    trackViewUrl: '',
  };
}

/** FNV-1a 32-bit hash → number; used to make seeding deterministic. */
function hash(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildEntryFor(buildingId: string): BuildingPlaylistEntry {
  // 1–3 agents per building, deterministically picked.
  const agentCount = 1 + (hash(buildingId, 1) % 3);
  const startAgent = hash(buildingId, 2) % AGENTS.length;
  const chosen = Array.from({ length: agentCount }, (_, i) =>
    AGENTS[(startAgent + i) % AGENTS.length]
  );

  const tracks: PinnedTrack[] = [];
  const taggerNotes: Record<string, string> = {};
  const playlistLikedBy: Record<string, string[]> = {};
  const baseTime = Date.now() - hash(buildingId, 3) % (1000 * 60 * 60 * 24 * 14); // within last 14d
  const usedIds = new Set<string>();

  chosen.forEach((agent, ai) => {
    // 3–6 tracks each so every seeded curator clears MIN_PLAYLIST_TRACKS.
    const trackCount = 3 + (hash(buildingId, 10 + ai) % 4); // 3–6 tracks each
    const startTrack = hash(buildingId, 20 + ai) % TRACK_POOL.length;
    for (let i = 0; i < trackCount; i++) {
      const track = TRACK_POOL[(startTrack + i * 3) % TRACK_POOL.length];
      if (usedIds.has(track.id)) continue; // dedupe at building level
      usedIds.add(track.id);
      const likes = hash(buildingId, 100 + ai * 10 + i) % 18; // 0–17 likes
      tracks.push({
        ...track,
        pinnedAt: baseTime - i * 1000 * 60 * 30 - ai * 1000 * 60 * 60 * 6,
        taggerId: agent.id,
        taggerName: agent.name,
        taggerAvatarUrl: agent.avatarUrl,
        likes,
        likedBy: Array.from({ length: likes }, (_, k) => `seed-liker-${k}`),
      });
    }
    taggerNotes[agent.id] = agent.note;
    // Seed 0–9 playlist-level likes per agent so the heart pill on the
    // ranking row already has a number to display.
    const plLikes = hash(buildingId, 200 + ai) % 10;
    playlistLikedBy[agent.id] = Array.from({ length: plLikes }, (_, k) => `seed-pl-liker-${k}`);
  });

  return { tracks, description: '', taggerNotes, playlistLikedBy };
}

/** Public entry point — call with the list of building IDs currently
 *  loaded for the area. Idempotent and never overwrites existing data. */
export function seedBuildingPlaylists(buildingIds: string[]): void {
  if (typeof window === 'undefined') return;
  if (buildingIds.length === 0) return;

  let raw: string | null = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { return; }
  let store: Record<string, BuildingPlaylistEntry> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, BuildingPlaylistEntry>;
      if (parsed && typeof parsed === 'object') store = parsed;
    } catch { /* corrupted — overwrite */ }
  }

  // Bump-on-version: when the seed schema changes (e.g. we added
  // playlistLikedBy), wipe ONLY the entries that were generated by us
  // (detected by agent-* taggerId namespace) and re-seed. Real user
  // pins (different taggerId) are preserved.
  let storedVersion: string | null = null;
  try { storedVersion = localStorage.getItem(SEED_VERSION_KEY); } catch { /* ignore */ }
  if (storedVersion !== SEED_VERSION) {
    for (const [bid, entry] of Object.entries(store)) {
      const allSeeded = entry.tracks.length > 0
        && entry.tracks.every((t) => (t.taggerId ?? '').startsWith('agent-'));
      if (allSeeded) delete store[bid];
    }
    try { localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION); } catch { /* ignore */ }
  }

  let added = 0;
  for (const bid of buildingIds) {
    if (added >= MAX_SEED_BUILDINGS) break;
    if (store[bid] && store[bid].tracks?.length > 0) continue; // skip real data
    store[bid] = buildEntryFor(bid);
    added += 1;
  }
  if (added === 0) return;

  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { return; }

  // Trigger same-tab listeners (the playlist module subscribes via its
  // own listener Set, but it only fires from in-process mutations.
  // Dispatching a StorageEvent doesn't re-fire in same tab; instead we
  // reload the store by invoking the public reset hook below.)
  reloadStore();
}

/** Force the in-memory store to re-read from localStorage and notify
 *  any subscribers (TopTaggerCard / PopularTrackCard / BuildingPlaylist). */
function reloadStore(): void {
  reloadFromStorage();
}
