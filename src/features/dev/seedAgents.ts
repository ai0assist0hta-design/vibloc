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
const SEED_VERSION = 'v5-personas-expanded';
const MAX_SEED_BUILDINGS = 40;

type Agent = {
  id: string;
  name: string;
  avatarUrl: string;
  /** Custom playlist NAME — appears as the headline on TopTaggerCard
   *  rows and PlaylistDetailView. Persona-flavored. */
  playlistName: string;
  /** Genre lean — used to pick tracks from the pool that match this
   *  curator's taste. Filters TRACK_POOL by `genre`. */
  taste: RecommendedTrack['genre'][];
  /** (Legacy) free-text note. UI no longer renders this — left for
   *  back-compat with older demo data shape. */
  note: string;
};

/** Demo curators — each one is a small persona with a distinct city,
 *  time-of-day, and taste profile. Names mix Korean, Japanese, and
 *  Western to mirror the cities VIBLOC ships (Shinjuku, Itaewon,
 *  Manhattan, LA). Avatars via DiceBear (deterministic by seed). */
const AGENTS: Agent[] = [
  {
    id: 'agent-luna', name: 'Luna Park', avatarUrl: dicebear('luna-park'),
    playlistName: '비 오는 새벽 4시 골목',
    taste: ['rnb', 'jazz', 'singer'],
    note: '늦은 밤 여기 앞에서 걷다가 머릿속에 박혔던 곡들.',
  },
  {
    id: 'agent-jiro', name: 'Jiro Tanaka', avatarUrl: dicebear('jiro-tanaka'),
    playlistName: 'Shinjuku 5AM Loop',
    taste: ['electronic', 'jpop', 'soundtrack'],
    note: 'coffee + ambient bass + neon reflections.',
  },
  {
    id: 'agent-min', name: 'Min Seo', avatarUrl: dicebear('min-seo'),
    playlistName: '이태원 골목길 R&B',
    taste: ['rnb', 'kpop', 'singer'],
    note: 'k-r&b heavy. 골목길 산책용 셀렉.',
  },
  {
    id: 'agent-hugo', name: 'Hugo Vrai', avatarUrl: dicebear('hugo-vrai'),
    playlistName: 'french touch / city pop',
    taste: ['electronic', 'jpop', 'pop'],
    note: 'french touch + city pop crossover. windows down only.',
  },
  {
    id: 'agent-ava', name: 'Ava Chen', avatarUrl: dicebear('ava-chen'),
    playlistName: 'rooftop sunset, indie + dream pop',
    taste: ['alternative', 'pop', 'singer'],
    note: 'rooftop sunset playlist · indie + dream pop',
  },
  {
    id: 'agent-noa', name: 'Noa Kim', avatarUrl: dicebear('noa-kim'),
    playlistName: '카페에서 아메리카노 한 잔',
    taste: ['jazz', 'singer', 'rnb'],
    note: 'lo-fi + jazz + 따뜻한 보컬.',
  },
  {
    id: 'agent-rio', name: 'Rio Suzuki', avatarUrl: dicebear('rio-suzuki'),
    playlistName: 'morning commute · lofi hiphop',
    taste: ['hiphop', 'electronic', 'jpop'],
    note: '매일 출근길 듣는 셋.',
  },
  {
    id: 'agent-ezra', name: 'Ezra Maeda', avatarUrl: dicebear('ezra-maeda'),
    playlistName: 'late night drives',
    taste: ['electronic', 'pop', 'rock'],
    note: 'synthwave heavy.',
  },
  {
    id: 'agent-sora', name: 'Sora Hinata', avatarUrl: dicebear('sora-hinata'),
    playlistName: '渋谷 일요일 오후',
    taste: ['jpop', 'pop', 'singer'],
    note: '시부야 brunch 카페 음악.',
  },
  {
    id: 'agent-kai',  name: 'Kai Roberts', avatarUrl: dicebear('kai-roberts'),
    playlistName: 'Brooklyn rooftop @ golden hour',
    taste: ['hiphop', 'rnb', 'pop'],
    note: 'BK summer set.',
  },
  {
    id: 'agent-yuna', name: 'Yuna Choi',   avatarUrl: dicebear('yuna-choi'),
    playlistName: '강남역 새벽 택시',
    taste: ['kpop', 'rnb', 'pop'],
    note: '플리 1시간 짜리 — 1차 끝나고 2차 가는 길.',
  },
  {
    id: 'agent-leo',  name: 'Leo Vasquez', avatarUrl: dicebear('leo-vasquez'),
    playlistName: 'echo park / silver lake drive',
    taste: ['alternative', 'latin', 'pop'],
    note: 'LA eastside windows down.',
  },
  {
    id: 'agent-mei',  name: 'Mei Watanabe', avatarUrl: dicebear('mei-watanabe'),
    playlistName: '신주쿠 비 오는 일요일',
    taste: ['jpop', 'jazz', 'singer'],
    note: 'rainy sunday at the listening bar.',
  },
  {
    id: 'agent-omar', name: 'Omar Hassan', avatarUrl: dicebear('omar-hassan'),
    playlistName: 'Manhattan 4 AM cab ride',
    taste: ['hiphop', 'rnb', 'electronic'],
    note: 'after-hours uptown taxi loop.',
  },
];

function dicebear(seed: string): string {
  // DiceBear v8 'avataaars' style — colorful, free, no API key, no CORS.
  return `https://api.dicebear.com/8.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

/** Real-ish iTunes track stubs. previewUrl left empty so the play
 *  button shows but stays disabled — keeps the UI honest. Artwork
 *  uses iTunes' public CDN (still hot-linkable). */
const TRACK_POOL: RecommendedTrack[] = [
  // ── Pop ──
  mk('1440857781', 'Blinding Lights',         'The Weeknd',         'pop',    'Pop'),
  mk('1440831203', 'Sunflower',               'Post Malone',        'pop',    'Pop'),
  mk('1440857784', 'As It Was',               'Harry Styles',       'pop',    'Pop'),
  mk('1500401823', 'Glimpse of Us',           'Joji',               'pop',    'Pop'),
  mk('1500401826', 'Snowman',                 'Sia',                'pop',    'Pop'),
  mk('p-flowers',  'Flowers',                 'Miley Cyrus',        'pop',    'Pop'),
  mk('p-vampire',  'vampire',                 'Olivia Rodrigo',     'pop',    'Pop'),
  // ── K-Pop ──
  mk('1500401818', 'Dynamite',                'BTS',                'kpop',   'K-Pop'),
  mk('1664031596', 'Cupid',                   'FIFTY FIFTY',        'kpop',   'K-Pop'),
  mk('1592163497', 'Kitsch',                  'IVE',                'kpop',   'K-Pop'),
  mk('1664031597', 'After LIKE',              'IVE',                'kpop',   'K-Pop'),
  mk('k-haewa',    'Haegeum',                 'Agust D',            'kpop',   'K-Pop'),
  mk('k-supershy', 'Super Shy',               'NewJeans',           'kpop',   'K-Pop'),
  mk('k-ditto',    'Ditto',                   'NewJeans',           'kpop',   'K-Pop'),
  // ── J-Pop ──
  mk('1535215575', 'Plastic Love',            'Mariya Takeuchi',    'jpop',   'J-Pop'),
  mk('1535215576', 'Stay With Me',            'Miki Matsubara',     'jpop',   'J-Pop'),
  mk('1500401820', 'Lemon',                   'Kenshi Yonezu',      'jpop',   'J-Pop'),
  mk('1535215577', 'Subtitle',                'Official髭男dism',    'jpop',   'J-Pop'),
  mk('j-mixed',    'Mixed Nuts',              'Official髭男dism',    'jpop',   'J-Pop'),
  mk('j-idol',     'アイドル',                 'YOASOBI',            'jpop',   'J-Pop'),
  mk('j-kaiju',    '怪獣の花唄',                'Vaundy',             'jpop',   'J-Pop'),
  // ── R&B / Soul ──
  mk('1440857782', 'Late Night Tales',        'Yebba',              'rnb',    'R&B/Soul'),
  mk('1500401821', 'Get You',                 'Daniel Caesar',      'rnb',    'R&B/Soul'),
  mk('1500401822', 'Pink + White',            'Frank Ocean',        'rnb',    'R&B/Soul'),
  mk('r-snooze',   'Snooze',                  'SZA',                'rnb',    'R&B/Soul'),
  mk('r-passion',  'Passionfruit',            'Drake',              'rnb',    'R&B/Soul'),
  mk('r-essence',  'Essence',                 'WizKid',             'rnb',    'R&B/Soul'),
  // ── Hip-Hop / Rap ──
  mk('1440831205', 'Industry Baby',           'Lil Nas X',          'hiphop', 'Hip-Hop/Rap'),
  mk('1440857783', 'God\'s Plan',             'Drake',              'hiphop', 'Hip-Hop/Rap'),
  mk('h-hotline',  'Hotline Bling',           'Drake',              'hiphop', 'Hip-Hop/Rap'),
  mk('h-flowers',  'No Idea',                 'Don Toliver',        'hiphop', 'Hip-Hop/Rap'),
  mk('h-rich',     'Rich Flex',               'Drake & 21 Savage',  'hiphop', 'Hip-Hop/Rap'),
  // ── Alternative ──
  mk('1500401824', 'Heat Waves',              'Glass Animals',      'alternative', 'Alternative'),
  mk('1440831207', 'Take a Walk',             'Passion Pit',        'alternative', 'Alternative'),
  mk('1500401825', 'Coffee',                  'beabadoobee',        'alternative', 'Alternative'),
  mk('a-mitski',   'My Love Mine All Mine',   'Mitski',             'alternative', 'Alternative'),
  mk('a-feast',    'Sofia',                   'Clairo',             'alternative', 'Alternative'),
  // ── Electronic ──
  mk('1440857785', 'Lo-fi Beats',             'Idealism',           'electronic', 'Electronic'),
  mk('e-strobe',   'Strobe',                  'Deadmau5',           'electronic', 'Electronic'),
  mk('e-around',   'Around the World',        'Daft Punk',          'electronic', 'Electronic'),
  mk('e-onemore',  'One More Time',           'Daft Punk',          'electronic', 'Electronic'),
  mk('e-instant',  'Instant Crush',           'Daft Punk',          'electronic', 'Electronic'),
  // ── Jazz ──
  mk('jz-soblue',  'So What',                 'Miles Davis',        'jazz',   'Jazz'),
  mk('jz-kindof',  'All Blues',               'Miles Davis',        'jazz',   'Jazz'),
  mk('jz-takefive','Take Five',               'Dave Brubeck',       'jazz',   'Jazz'),
  // ── Singer / Songwriter ──
  mk('s-anti',     'Anti-Hero',               'Taylor Swift',       'singer', 'Singer/Songwriter'),
  mk('s-lover',    'lovely',                  'Billie Eilish',      'singer', 'Singer/Songwriter'),
  mk('s-skinny',   'Skinny',                  'Billie Eilish',      'singer', 'Singer/Songwriter'),
  // ── Latin ──
  mk('l-tusa',     'Tusa',                    'Karol G & Nicki Minaj', 'latin', 'Latin'),
  mk('l-despac',   'Despacito',               'Luis Fonsi',         'latin',  'Latin'),
  // ── Soundtrack / Cinema ──
  mk('o-mononoke', 'もののけ姫',                '久石譲',              'soundtrack', 'Soundtrack'),
  mk('o-rain',     'Comptine d\'un autre été','Yann Tiersen',        'soundtrack', 'Soundtrack'),
  // ── Rock ──
  mk('rk-bohemian','Bohemian Rhapsody',       'Queen',              'rock',   'Rock'),
  mk('rk-radiohd', 'Creep',                   'Radiohead',          'rock',   'Rock'),
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
  // 2–5 agents per building so TOP PLAYLISTS has a real ranked list
  // to show / scroll instead of one or two lonely rows.
  const agentCount = 2 + (hash(buildingId, 1) % 4);
  const startAgent = hash(buildingId, 2) % AGENTS.length;
  const chosen = Array.from({ length: agentCount }, (_, i) =>
    AGENTS[(startAgent + i * 3) % AGENTS.length]
  );

  const tracks: PinnedTrack[] = [];
  const taggerNotes: Record<string, string> = {};
  const taggerPlaylistNames: Record<string, string> = {};
  const playlistLikedBy: Record<string, string[]> = {};
  const baseTime = Date.now() - hash(buildingId, 3) % (1000 * 60 * 60 * 24 * 14);
  const usedIds = new Set<string>();

  chosen.forEach((agent, ai) => {
    // Filter the pool by this agent's taste. Drives the per-row
    // "수록 N회" overlap to be meaningful — agents with shared taste
    // (e.g. two R&B curators) end up pinning the same track.
    const taste = new Set(agent.taste);
    const tastePool = TRACK_POOL.filter((t) => taste.has(t.genre));
    const pool = tastePool.length > 0 ? tastePool : TRACK_POOL;

    // 3–6 tracks each so every seeded curator clears MIN_PLAYLIST_TRACKS.
    const trackCount = 3 + (hash(buildingId, 10 + ai) % 4);
    const startTrack = hash(buildingId, 20 + ai) % pool.length;
    for (let i = 0; i < trackCount; i++) {
      const track = pool[(startTrack + i * 2) % pool.length];
      if (usedIds.has(`${agent.id}|${track.id}`)) continue;
      usedIds.add(`${agent.id}|${track.id}`);
      // Cross-tagger overlap is fine (drives "수록 N회"), but a single
      // tagger shouldn't pin the same track twice.
      const likes = hash(buildingId, 100 + ai * 10 + i) % 24; // 0–23
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
    taggerPlaylistNames[agent.id] = agent.playlistName;
    // 0–24 playlist-level likes per agent so the rank-by-likes order
    // is meaningful and the heart counts span a real range.
    const plLikes = hash(buildingId, 200 + ai) % 25;
    playlistLikedBy[agent.id] = Array.from({ length: plLikes }, (_, k) => `seed-pl-liker-${k}`);
  });

  return {
    tracks,
    description: '',
    taggerNotes,
    taggerPlaylistNames,
    playlistLikedBy,
  };
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
