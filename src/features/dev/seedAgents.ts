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
// v11 = tier-0 iTunes lookup pass. Bumping wipes seeded buildings
// so the enricher can re-resolve every track via lookup?id=… (for
// numeric iTunes trackIds) or storefront-aware scored search (for
// text seed ids), producing the byte-exact Apple Music cover.
const SEED_VERSION = 'v11-itunes-lookup';
const MAX_SEED_BUILDINGS = 40;

type Country = 'JP' | 'KR' | 'US';

type Agent = {
  id: string;
  name: string;
  /** Curator-chosen avatar URL. ALWAYS null for seed agents. */
  avatarUrl: string | null;
  /** Where this curator is "from" — drives which buildings they
   *  show up on. JP agents on Tokyo buildings, KR agents on Seoul,
   *  US agents on NYC/LA. We sprinkle a small fraction of off-locale
   *  curators into each building so cities still feel cosmopolitan. */
  homeCountry: Country;
  /** Custom playlist NAME — appears as the headline. */
  playlistName: string;
  /** Genre lean — filters TRACK_POOL by `genre`. */
  taste: RecommendedTrack['genre'][];
  /** Persona vibe tag. Used by buildVibeFor() to weight agents
   *  toward matching building shapes (`office` → "lo-fi commute"
   *  curators, `late-night` → club / drive curators, etc.) */
  vibe: 'office' | 'cafe' | 'late-night' | 'sunset' | 'hangout';
  /** Legacy free-text note (UI no longer renders it). */
  note: string;
};

/** Demo curators — each one is a small persona with a distinct city,
 *  time-of-day, and taste profile. Names mix Korean, Japanese, and
 *  Western to mirror the cities VIBLOC ships (Shinjuku, Itaewon,
 *  Manhattan, LA). Avatars via DiceBear (deterministic by seed). */
const AGENTS: Agent[] = [
  // ── KR curators (Seoul: Itaewon, Gangnam, Hongdae) ──
  { id: 'agent-luna', name: 'Luna Park', avatarUrl: null,
    homeCountry: 'KR', vibe: 'late-night',
    playlistName: 'rainy 4am alley walk',
    taste: ['rnb', 'jazz', 'singer'],
    note: 'late-night songs from walking these blocks.' },
  { id: 'agent-min', name: 'Min Seo', avatarUrl: null,
    homeCountry: 'KR', vibe: 'sunset',
    playlistName: 'Itaewon backstreet R&B',
    taste: ['rnb', 'kpop', 'singer'],
    note: 'k-r&b heavy. for slow walks down side alleys.' },
  { id: 'agent-yuna', name: 'Yuna Choi', avatarUrl: null,
    homeCountry: 'KR', vibe: 'late-night',
    playlistName: 'Gangnam 3AM cab',
    taste: ['kpop', 'rnb', 'pop'],
    note: 'one-hour set — leaving the first round, heading to the second.' },
  { id: 'agent-jaehyun', name: 'Jaehyun Park', avatarUrl: null,
    homeCountry: 'KR', vibe: 'office',
    playlistName: 'Yeoksam tower lunch hour',
    taste: ['kpop', 'pop', 'electronic'],
    note: '회식 전 카페 셋.' },
  { id: 'agent-haeun', name: 'Haeun Lee', avatarUrl: null,
    homeCountry: 'KR', vibe: 'cafe',
    playlistName: 'Hongdae bookshop afternoon',
    taste: ['singer', 'jazz', 'alternative'],
    note: 'soft acoustic set.' },

  // ── JP curators (Shinjuku, Shibuya) ──
  { id: 'agent-jiro', name: 'Jiro Tanaka', avatarUrl: null,
    homeCountry: 'JP', vibe: 'late-night',
    playlistName: 'Shinjuku 5AM loop',
    taste: ['electronic', 'jpop', 'soundtrack'],
    note: 'coffee + ambient bass + neon reflections.' },
  { id: 'agent-rio', name: 'Rio Suzuki', avatarUrl: null,
    homeCountry: 'JP', vibe: 'office',
    playlistName: 'morning commute · lofi hiphop',
    taste: ['hiphop', 'electronic', 'jpop'],
    note: 'my daily train-ride set.' },
  { id: 'agent-sora', name: 'Sora Hinata', avatarUrl: null,
    homeCountry: 'JP', vibe: 'cafe',
    playlistName: 'Shibuya sunday afternoon',
    taste: ['jpop', 'pop', 'singer'],
    note: 'brunch-cafe playlist.' },
  { id: 'agent-mei', name: 'Mei Watanabe', avatarUrl: null,
    homeCountry: 'JP', vibe: 'cafe',
    playlistName: 'rainy sunday in Shinjuku',
    taste: ['jpop', 'jazz', 'singer'],
    note: 'rainy sunday at the listening bar.' },
  { id: 'agent-haru', name: 'Haru Mori', avatarUrl: null,
    homeCountry: 'JP', vibe: 'sunset',
    playlistName: 'Tokyo rooftop sundown',
    taste: ['jpop', 'pop', 'electronic'],
    note: 'city pop revival cuts.' },

  // ── US curators (Manhattan, LA) ──
  { id: 'agent-kai', name: 'Kai Roberts', avatarUrl: null,
    homeCountry: 'US', vibe: 'sunset',
    playlistName: 'Brooklyn rooftop @ golden hour',
    taste: ['hiphop', 'rnb', 'pop'],
    note: 'BK summer set.' },
  { id: 'agent-omar', name: 'Omar Hassan', avatarUrl: null,
    homeCountry: 'US', vibe: 'late-night',
    playlistName: 'Manhattan 4AM cab ride',
    taste: ['hiphop', 'rnb', 'electronic'],
    note: 'after-hours uptown taxi loop.' },
  { id: 'agent-leo', name: 'Leo Vasquez', avatarUrl: null,
    homeCountry: 'US', vibe: 'hangout',
    playlistName: 'echo park / silver lake drive',
    taste: ['alternative', 'latin', 'pop'],
    note: 'LA eastside, windows down.' },
  { id: 'agent-ava', name: 'Ava Chen', avatarUrl: null,
    homeCountry: 'US', vibe: 'sunset',
    playlistName: 'rooftop sunset, indie + dream pop',
    taste: ['alternative', 'pop', 'singer'],
    note: 'indie + dream pop.' },
  { id: 'agent-ezra', name: 'Ezra Maeda', avatarUrl: null,
    homeCountry: 'US', vibe: 'late-night',
    playlistName: 'late night drives',
    taste: ['electronic', 'pop', 'rock'],
    note: 'synthwave heavy.' },
  { id: 'agent-noa', name: 'Noa Kim', avatarUrl: null,
    homeCountry: 'US', vibe: 'cafe',
    playlistName: 'cafe americano hour',
    taste: ['jazz', 'singer', 'rnb'],
    note: 'lo-fi + jazz + warm vocals.' },
  { id: 'agent-hugo', name: 'Hugo Vrai', avatarUrl: null,
    homeCountry: 'US', vibe: 'hangout',
    playlistName: 'french touch / city pop',
    taste: ['electronic', 'jpop', 'pop'],
    note: 'french touch + city pop crossover.' },
];

// (Removed `dicebear()` and `avatarFor()` 2026-04-27. Seeded agents
//  no longer carry an avatar URL — the playlist's top-track album
//  cover is now the default thumbnail per user direction.)

/** Country → preferred genre families for track selection. Used by
 *  the seeder to bias each city's playlists toward locally relevant
 *  music (Tokyo → J-Pop / Anime / Soundtrack, Seoul → K-Pop / R&B,
 *  US → Hip-Hop / Pop / Latin). Other genres still appear via
 *  cross-locale curators, just less dominantly. */
const COUNTRY_TRACK_PREFERENCE: Record<Country, Set<RecommendedTrack['genre']>> = {
  JP: new Set<RecommendedTrack['genre']>(['jpop', 'soundtrack', 'electronic', 'jazz', 'singer']),
  KR: new Set<RecommendedTrack['genre']>(['kpop', 'rnb', 'hiphop', 'pop', 'singer']),
  US: new Set<RecommendedTrack['genre']>(['pop', 'hiphop', 'rnb', 'alternative', 'latin', 'electronic']),
};

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

type BuildingShape = {
  id: string;
  height: number;
  tagCategories: string[];
};

/** Infer a vibe weight per agent for a given building. Skyscrapers
 *  (>120m) skew to office / commute curators; low retail/restaurant
 *  blocks skew to cafe / sunset / hangout; entertainment-heavy
 *  buildings skew late-night. Returns a multiplier in roughly
 *  [0.5, 2.0] applied during agent ranking. */
function vibeWeightFor(agent: Agent, b: BuildingShape): number {
  const tags = new Set(b.tagCategories);
  const tall = b.height >= 120;
  const mid = b.height >= 40 && b.height < 120;
  const isFood = tags.has('food');
  const isShop = tags.has('shop');
  const isHotel = tags.has('hotel');
  const isOffice = tags.has('office') || tall;
  const isEnt = tags.has('entertainment');
  switch (agent.vibe) {
    case 'office':     return isOffice ? 1.8 : (mid ? 1.0 : 0.6);
    case 'cafe':       return isFood ? 1.6 : (isShop || isHotel ? 1.1 : 0.7);
    case 'late-night': return isEnt ? 1.8 : (isFood ? 1.2 : tall ? 0.9 : 0.7);
    case 'sunset':     return isHotel ? 1.5 : (mid ? 1.1 : 0.9);
    case 'hangout':    return isShop || isFood ? 1.3 : 0.9;
    default:           return 1.0;
  }
}

function buildEntryFor(
  building: BuildingShape,
  country: Country | undefined,
): BuildingPlaylistEntry {
  // Filter agents by locale: 70% of slots reserved for in-country
  // curators, the rest sprinkled from off-locale agents so the
  // panel still feels cosmopolitan. When country is unknown, use
  // the full pool.
  const local = country ? AGENTS.filter((a) => a.homeCountry === country) : AGENTS;
  const foreign = country ? AGENTS.filter((a) => a.homeCountry !== country) : [];

  // Score every candidate by vibe match × stable per-building hash
  // so the same building always picks the same lineup.
  const scored = (agents: Agent[]) => agents
    .map((a) => ({
      agent: a,
      score: vibeWeightFor(a, building) +
             // Per-building deterministic jitter so two same-vibe
             // agents don't always rank in the same order across
             // every building. Range ≈ 0..0.6.
             ((hash(building.id + a.id, 7) % 60) / 100),
    }))
    .sort((x, y) => y.score - x.score);

  const localRanked = scored(local).map((r) => r.agent);
  const foreignRanked = scored(foreign).map((r) => r.agent);

  // 2–5 agents per building. Take from local first, top-up with
  // foreign so cosmopolitan buildings still get a sprinkle.
  const agentCount = 2 + (hash(building.id, 1) % 4);
  const localTake = Math.max(1, Math.ceil(agentCount * 0.7));
  const chosen: Agent[] = [
    ...localRanked.slice(0, localTake),
    ...foreignRanked.slice(0, agentCount - localTake),
  ].slice(0, agentCount);

  const tracks: PinnedTrack[] = [];
  const taggerNotes: Record<string, string> = {};
  const taggerPlaylistNames: Record<string, string> = {};
  const playlistLikedBy: Record<string, string[]> = {};
  const baseTime = Date.now() - hash(building.id, 3) % (1000 * 60 * 60 * 24 * 14);
  const usedIds = new Set<string>();

  chosen.forEach((agent, ai) => {
    // Country-aware track pool: bias toward in-country genres so
    // Tokyo buildings serve more J-Pop, Seoul → K-Pop, etc.
    const countryGenres = COUNTRY_TRACK_PREFERENCE[country ?? 'US'] ?? new Set();
    const tasteSet = new Set(agent.taste);
    const tastePool = TRACK_POOL.filter((t) => tasteSet.has(t.genre));
    const localBias = TRACK_POOL.filter((t) => countryGenres.has(t.genre));
    // Composed pool: prefer (taste ∩ country) → taste → country → all
    const tasteAndLocal = tastePool.filter((t) => countryGenres.has(t.genre));
    const pool =
      tasteAndLocal.length >= 4 ? tasteAndLocal :
      tastePool.length >= 3     ? tastePool :
      localBias.length >= 3     ? localBias :
      TRACK_POOL;

    const trackCount = 3 + (hash(building.id, 10 + ai) % 4);
    const startTrack = hash(building.id, 20 + ai) % pool.length;
    for (let i = 0; i < trackCount; i++) {
      const track = pool[(startTrack + i * 2) % pool.length];
      if (usedIds.has(`${agent.id}|${track.id}`)) continue;
      usedIds.add(`${agent.id}|${track.id}`);
      const likes = hash(building.id, 100 + ai * 10 + i) % 24;
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
    const plLikes = hash(building.id, 200 + ai) % 25;
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

/** Public entry point — call with the list of building shapes
 *  currently loaded for the area + the area's country code.
 *  Idempotent and never overwrites existing data. */
export function seedBuildingPlaylists(
  buildings: BuildingShape[],
  country?: Country,
): void {
  if (typeof window === 'undefined') return;
  if (buildings.length === 0) return;

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
  for (const b of buildings) {
    if (added >= MAX_SEED_BUILDINGS) break;
    if (store[b.id] && store[b.id].tracks?.length > 0) continue; // skip real data
    store[b.id] = buildEntryFor(b, country);
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
