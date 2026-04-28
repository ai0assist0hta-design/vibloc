// Build-time seed cover baker. Tries every available music data
// source (iTunes JP/KR/US, Deezer, MusicBrainz + Cover Art Archive)
// for each seed track, picks the best result, and writes a frozen
// JSON map that the runtime enricher uses as its primary tier.
//
// Why build-time
// --------------
// Runtime is constrained by browser CORS (Deezer api blocks all
// cross-origin), iTunes search rate limits (~20 req/min), and
// MusicBrainz's strict 1 req/sec anonymous cap. From Node those
// limits either don't apply (no CORS in server-side fetch) or are
// trivial to throttle. Doing the resolution once at build time and
// shipping the resulting URLs gives the runtime a 100% match rate
// with zero network calls.
//
// Output: src/features/dev/seedCovers.json
// Shape:  { "{normalized artist}|{normalized title}": {
//             url: "https://...",
//             previewUrl?: "...",
//             trackViewUrl?: "...",
//             source: "itunes-id" | "itunes-search" | "deezer" | "musicbrainz",
//             pickedTitle: "Apple's actual track name",
//             pickedCollection: "Apple's actual collection name",
//          }}
//
// Usage:  node scripts/bakeSeedCovers.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFile = join(__dirname, '..', 'src', 'features', 'dev', 'seedAgents.ts');
const outFile  = join(__dirname, '..', 'src', 'features', 'dev', 'seedCovers.json');

// ─── Extract seed table from seedAgents.ts ───────────────────────────
const src = readFileSync(seedFile, 'utf8');
const poolMatch = src.match(/const TRACK_POOL[\s\S]*?\n\];/);
if (!poolMatch) { console.error('TRACK_POOL not found'); process.exit(1); }
const seeds = poolMatch[0].split('\n')
  .map(l => l.match(/mk\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/))
  .filter(Boolean)
  .map(m => ({ id: m[1], title: m[2], artist: m[3], genre: m[4] }));

console.log(`Loaded ${seeds.length} seed tracks`);

// ─── Helpers ─────────────────────────────────────────────────────────
const HANGUL_RE = /[가-힯ᄀ-ᇿ]/;
const KANA_RE   = /[぀-ヿ]/;
const CJK_RE    = /[㐀-鿿]/;
const VARIANT_RE = /\b(remix|cover|karaoke|tribute|live|instrumental|acoustic|remaster(?:ed)?|edit|version|mix|sped\s*up|slowed|deluxe edition|chopped)\b/i;
const COMPILATION_RE = /\b(compilation|various artists|now that's what|hits|greatest|the best of|deluxe|bonus track|anniversary|reissue|collection|dj\s*mix|boiler\s*room|today'?s hits|workout|playlist|mixed by|ministry of sound|continuous mix|pres\.|presents|zumba)\b/i;

function detectCountry(t, a, g) {
  const both = `${t} ${a}`;
  if (HANGUL_RE.test(both)) return 'kr';
  if (KANA_RE.test(both))   return 'jp';
  if (g === 'kpop')         return 'kr';
  if (g === 'jpop')         return 'jp';
  if (CJK_RE.test(both))    return 'jp';
  return 'us';
}

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/\([^)]*\)/g,' ').replace(/\[[^\]]*\]/g,' ')
    .replace(/\bfeat\.?\b.*$/i,' ').replace(/[^\p{L}\p{N}]+/gu,' ')
    .trim().replace(/\s+/g,' ');
}

function score(c, w) {
  const ct = normalize(c.trackName||c.title), ca = normalize(c.artistName||c.artist);
  const wt = normalize(w.title), wa = normalize(w.artist);
  let s = 0;
  if (ct === wt) s += 50; else if (ct.startsWith(wt) || wt.startsWith(ct)) s += 35;
  else if (ct.includes(wt) || wt.includes(ct)) s += 22;
  if (ca === wa) s += 50; else if (ca.includes(wa) || wa.includes(ca)) s += 38;
  else { const ps = ca.split(/[,&]| and | x | feat | featuring /).map(p=>p.trim()).filter(Boolean);
    if (ps.some(p => p === wa || p.includes(wa) || wa.includes(p))) s += 32; }
  if (VARIANT_RE.test(c.trackName||'') && !VARIANT_RE.test(w.title)) s -= 60;
  if (c.trackCount === 1) s += 8;
  if (c.collectionName && COMPILATION_RE.test(c.collectionName)) s -= 30; // stricter at bake time
  if (c.releaseDate) {
    const yr = new Date(c.releaseDate).getFullYear();
    if (!Number.isNaN(yr)) s += Math.min(5, Math.max(0, (new Date().getFullYear() - yr) / 5));
  }
  return s;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function jget(url, opts = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) { await sleep(1500); continue; }
      return await r.json();
    } catch { await sleep(1500); }
  }
  return null;
}

// ─── Source 1: iTunes lookup by id (storefront-aware) ────────────────
async function tryItunesLookup(seed) {
  if (!/^\d{6,12}$/.test(seed.id)) return null;
  const stores = Array.from(new Set([detectCountry(seed.title, seed.artist, seed.genre), 'us']));
  for (const cc of stores) {
    const j = await jget(`https://itunes.apple.com/lookup?id=${seed.id}&country=${cc}&entity=song`);
    const r = (j?.results || []).find(x => x.wrapperType === 'track');
    if (r) {
      // Reject if Apple says this id is a karaoke / remix / DJ mix.
      if (VARIANT_RE.test(r.trackName) && !VARIANT_RE.test(seed.title)) continue;
      if (COMPILATION_RE.test(r.collectionName || '')) continue;
      return {
        url: (r.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        previewUrl: r.previewUrl,
        trackViewUrl: r.trackViewUrl,
        source: 'itunes-id',
        pickedTitle: r.trackName,
        pickedCollection: r.collectionName,
        country: cc,
      };
    }
    await sleep(400);
  }
  return null;
}

// ─── Source 2: iTunes search (storefront + scored) ───────────────────
async function tryItunesSearch(seed) {
  const stores = Array.from(new Set([detectCountry(seed.title, seed.artist, seed.genre), 'us']));
  let best = null;
  for (const cc of stores) {
    const term = encodeURIComponent(`${seed.title} ${seed.artist}`);
    const j = await jget(`https://itunes.apple.com/search?term=${term}&country=${cc}&media=music&entity=song&limit=15`);
    const results = j?.results || [];
    for (const r of results) {
      const s = score(r, seed);
      if (s >= 80 && (!best || s > best._s)) best = { ...r, _s: s };
    }
    if (best && best._s >= 95) break;
    await sleep(800);
  }
  if (!best) return null;
  return {
    url: (best.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
    previewUrl: best.previewUrl,
    trackViewUrl: best.trackViewUrl,
    source: 'itunes-search',
    pickedTitle: best.trackName,
    pickedCollection: best.collectionName,
    score: best._s,
  };
}

// ─── Source 3: Deezer (no CORS issue at build time) ──────────────────
async function tryDeezer(seed) {
  const term = encodeURIComponent(`track:"${seed.title}" artist:"${seed.artist}"`);
  const j = await jget(`https://api.deezer.com/search?q=${term}&limit=10`);
  const results = j?.data || [];
  if (!results.length) return null;
  let best = null;
  for (const r of results) {
    const s = score(
      { trackName: r.title, artistName: r.artist?.name, collectionName: r.album?.title },
      seed,
    );
    if (s >= 80 && (!best || s > best._s)) best = { ...r, _s: s };
  }
  if (!best) return null;
  // Deezer image sizes: cover_xl (1000), cover_big (500), cover_medium (250)
  const url = best.album?.cover_xl || best.album?.cover_big;
  if (!url) return null;
  return {
    url,
    previewUrl: best.preview,
    source: 'deezer',
    pickedTitle: best.title,
    pickedCollection: best.album?.title,
    score: best._s,
  };
}

// ─── Source 4: MusicBrainz + Cover Art Archive ───────────────────────
let mbLastCall = 0;
async function mbThrottle() {
  const wait = Math.max(0, 1100 - (Date.now() - mbLastCall));
  if (wait) await sleep(wait);
  mbLastCall = Date.now();
}

async function tryMusicBrainz(seed) {
  const cleanA = seed.artist.replace(/["+\-!(){}[\]^~*?:\\/]/g, ' ').trim();
  const cleanT = seed.title.replace(/["+\-!(){}[\]^~*?:\\/]/g, ' ').trim();
  const q = encodeURIComponent(`recording:"${cleanT}" AND artist:"${cleanA}"`);
  await mbThrottle();
  const j = await jget(
    `https://musicbrainz.org/ws/2/recording/?query=${q}&limit=5&fmt=json`,
    { headers: { 'User-Agent': 'VIBLOC-cover-baker/1.0 ( han@example.com )' } },
  );
  const recordings = (j?.recordings || []).filter(r => (r.score ?? 0) >= 90);
  for (const rec of recordings) {
    const releases = (rec.releases || [])
      .slice()
      .sort((a, b) => (a.status === 'Official' ? -1 : 1) - (b.status === 'Official' ? -1 : 1));
    for (const rel of releases) {
      await mbThrottle();
      try {
        const r = await fetch(`https://coverartarchive.org/release/${rel.id}/front-1200`, { method: 'HEAD' });
        if (r.ok) {
          return {
            url: r.url || `https://coverartarchive.org/release/${rel.id}/front-1200`,
            source: 'musicbrainz',
            pickedTitle: rec.title,
            pickedCollection: rel.title,
          };
        }
      } catch { /* try next release */ }
    }
  }
  return null;
}

// ─── Resolve one seed by trying every source in priority order ───────
async function resolve(seed) {
  // 1. iTunes lookup-by-id is the strongest signal when we have a numeric id
  let hit = await tryItunesLookup(seed);
  if (hit) return hit;

  // 2. iTunes search with strict scorer
  hit = await tryItunesSearch(seed);
  if (hit) return hit;

  // 3. Deezer (different catalog — sometimes finds JP/KR releases iTunes doesn't)
  hit = await tryDeezer(seed);
  if (hit) return hit;

  // 4. MusicBrainz + CAA — last resort, broadest catalog
  hit = await tryMusicBrainz(seed);
  if (hit) return hit;

  return null;
}

// ─── Main ────────────────────────────────────────────────────────────
const out = {};
let resolved = 0, failed = 0;

for (const seed of seeds) {
  const key = `${normalize(seed.artist)}|${normalize(seed.title)}`;
  const hit = await resolve(seed);
  if (hit) {
    out[key] = hit;
    resolved++;
    const flag = hit.source === 'itunes-id' ? '🎯' : hit.source === 'itunes-search' ? '🔍' : hit.source === 'deezer' ? '🎵' : '📚';
    console.log(`${flag} ${seed.title.padEnd(28)} / ${seed.artist.padEnd(22)} → ${hit.source.padEnd(15)} ${hit.pickedCollection || ''}`);
  } else {
    failed++;
    console.log(`❌ ${seed.title.padEnd(28)} / ${seed.artist.padEnd(22)} → no match`);
  }
  // Be a polite citizen: 600 ms between seeds keeps everything well
  // under iTunes' rate limit and MusicBrainz's 1 req/sec.
  await sleep(600);
}

writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
console.log(`\n✅ ${resolved}/${seeds.length} resolved, ${failed} failed → ${outFile}`);
