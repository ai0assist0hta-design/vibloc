// Comprehensive seed-cover audit.
//
// For each seed track:
//  1) If id is numeric: hit iTunes /lookup?id={id} → record what collection
//     it actually points to (= what cover the user will see).
//  2) ALWAYS also run a search and apply the same scorer the runtime uses.
//     If the search picks a *different* collection that scores better
//     (single > album > deluxe > compilation), suggest swapping.
//  3) Print one line per track:
//       OK | KEEP   …    current collection passes the smell test
//       OK | SWAP   …    a better collection exists → suggested new (id, collId)
//       NO_MATCH      … no result clears MIN_SCORE; needs manual lookup
//
// 3-second delay between calls so iTunes doesn't 503 us.

const SEEDS = [
  ['1488408568', 'Blinding Lights',         'The Weeknd',         'pop',         'Pop'],
  ['1445949267', 'Sunflower',               'Post Malone',        'pop',         'Pop'],
  ['1615585008', 'As It Was',               'Harry Styles',       'pop',         'Pop'],
  ['1776748883', 'Glimpse of Us',           'Joji',               'pop',         'Pop'],
  ['1440098017', 'Snowman',                 'Sia',                'pop',         'Pop'],
  ['1674691586', 'Flowers',                 'Miley Cyrus',        'pop',         'Pop'],
  ['1736995100', 'vampire',                 'Olivia Rodrigo',     'pop',         'Pop'],
  ['1597024424', 'Dynamite',                'BTS',                'kpop',        'K-Pop'],
  ['1762365714', 'Cupid',                   'FIFTY FIFTY',        'kpop',        'K-Pop'],
  ['1677260541', 'Kitsch',                  'IVE',                'kpop',        'K-Pop'],
  ['1639416903', 'After LIKE',              'IVE',                'kpop',        'K-Pop'],
  ['1681823696', 'Haegeum',                 'Agust D',            'kpop',        'K-Pop'],
  ['1692686518', 'Super Shy',               'NewJeans',           'kpop',        'K-Pop'],
  ['1657231962', 'Ditto',                   'NewJeans',           'kpop',        'K-Pop'],
  ['1541673399', 'Plastic Love',            'Mariya Takeuchi',    'jpop',        'J-Pop'],
  ['1535215576', 'Stay With Me',            'Miki Matsubara',     'jpop',        'J-Pop'],
  ['1537460612', 'Lemon',                   'Kenshi Yonezu',      'jpop',        'J-Pop'],
  ['1648108988', 'Subtitle',                'Official髭男dism',    'jpop',        'J-Pop'],
  ['j-mixed',    'Mixed Nuts',              'Official髭男dism',    'jpop',        'J-Pop'],
  ['1679278167', 'アイドル',                 'YOASOBI',            'jpop',        'J-Pop'],
  ['1706832137', '怪獣の花唄',                'Vaundy',             'jpop',        'J-Pop'],
  ['1440857782', 'Late Night Tales',        'Yebba',              'rnb',         'R&B/Soul'],
  ['1799080775', 'Get You',                 'Daniel Caesar',      'rnb',         'R&B/Soul'],
  ['1146195714', 'Pink + White',            'Frank Ocean',        'rnb',         'R&B/Soul'],
  ['1658650499', 'Snooze',                  'SZA',                'rnb',         'R&B/Soul'],
  ['r-passion',  'Passionfruit',            'Drake',              'rnb',         'R&B/Soul'],
  ['r-essence',  'Essence',                 'WizKid',             'rnb',         'R&B/Soul'],
  ['1440831205', 'Industry Baby',           'Lil Nas X',          'hiphop',      'Hip-Hop/Rap'],
  ['1440857783', "God's Plan",              'Drake',              'hiphop',      'Hip-Hop/Rap'],
  ['h-hotline',  'Hotline Bling',           'Drake',              'hiphop',      'Hip-Hop/Rap'],
  ['h-flowers',  'No Idea',                 'Don Toliver',        'hiphop',      'Hip-Hop/Rap'],
  ['h-rich',     'Rich Flex',               'Drake & 21 Savage',  'hiphop',      'Hip-Hop/Rap'],
  ['1500401824', 'Heat Waves',              'Glass Animals',      'alternative', 'Alternative'],
  ['1440831207', 'Take a Walk',             'Passion Pit',        'alternative', 'Alternative'],
  ['1500401825', 'Coffee',                  'beabadoobee',        'alternative', 'Alternative'],
  ['a-mitski',   'My Love Mine All Mine',   'Mitski',             'alternative', 'Alternative'],
  ['a-feast',    'Sofia',                   'Clairo',             'alternative', 'Alternative'],
  ['1440857785', 'Lo-fi Beats',             'Idealism',           'electronic',  'Electronic'],
  ['e-strobe',   'Strobe',                  'Deadmau5',           'electronic',  'Electronic'],
  ['e-around',   'Around the World',        'Daft Punk',          'electronic',  'Electronic'],
  ['e-onemore',  'One More Time',           'Daft Punk',          'electronic',  'Electronic'],
  ['e-instant',  'Instant Crush',           'Daft Punk',          'electronic',  'Electronic'],
  ['jz-soblue',  'So What',                 'Miles Davis',        'jazz',        'Jazz'],
  ['jz-kindof',  'All Blues',               'Miles Davis',        'jazz',        'Jazz'],
  ['jz-takefive','Take Five',               'Dave Brubeck',       'jazz',        'Jazz'],
  ['1650859888', 'Anti-Hero',               'Taylor Swift',       'singer',      'Singer/Songwriter'],
  ['1369380479', 'lovely',                  'Billie Eilish',      'singer',      'Singer/Songwriter'],
  ['1739659137', 'Skinny',                  'Billie Eilish',      'singer',      'Singer/Songwriter'],
  ['1507252551', 'Tusa',                    'Karol G & Nicki Minaj', 'latin',    'Latin'],
  ['1445025224', 'Despacito',               'Luis Fonsi',         'latin',       'Latin'],
  ['o-mononoke', 'もののけ姫',                '久石譲',              'soundtrack',  'Soundtrack'],
  ['o-rain',     "Comptine d'un autre été", 'Yann Tiersen',       'soundtrack',  'Soundtrack'],
  ['rk-bohemian','Bohemian Rhapsody',       'Queen',              'rock',        'Rock'],
  ['rk-radiohd', 'Creep',                   'Radiohead',          'rock',        'Rock'],
];

const HANGUL_RE = /[가-힯ᄀ-ᇿ]/;
const KANA_RE   = /[぀-ヿ]/;
const CJK_RE    = /[㐀-鿿]/;
const VARIANT_RE = /\b(remix|cover|karaoke|tribute|live|instrumental|acoustic|remaster(?:ed)?|edit|version|mix|sped\s*up|slowed|deluxe edition)\b/i;
const COMPILATION_RE = /\b(compilation|various artists|now that's what|hits|greatest|the best of|deluxe|bonus track|anniversary|reissue|collection)\b/i;

function detectStorefront(t, a, fb, g) {
  const both = `${t} ${a}`;
  if (HANGUL_RE.test(both)) return 'kr';
  if (KANA_RE.test(both)) return 'jp';
  if (g === 'kpop') return 'kr';
  if (g === 'jpop') return 'jp';
  if (CJK_RE.test(both)) return 'jp';
  return fb;
}
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/\([^)]*\)/g,' ').replace(/\[[^\]]*\]/g,' ')
    .replace(/\bfeat\.?\b.*$/i,' ').replace(/[^\p{L}\p{N}]+/gu,' ')
    .trim().replace(/\s+/g,' ');
}
function score(c, w) {
  const ct=normalize(c.trackName||''),ca=normalize(c.artistName||''),wt=normalize(w.trackName),wa=normalize(w.artistName);
  let s=0;
  if(ct===wt)s+=50;else if(ct.startsWith(wt)||wt.startsWith(ct))s+=35;else if(ct.includes(wt)||wt.includes(ct))s+=22;
  if(ca===wa)s+=50;else if(ca.includes(wa)||wa.includes(ca))s+=38;
  else{const ps=ca.split(/[,&]| and | x | feat | featuring /).map(p=>p.trim()).filter(Boolean);if(ps.some(p=>p===wa||p.includes(wa)||wa.includes(p)))s+=32;}
  if (VARIANT_RE.test(c.trackName||'') && !VARIANT_RE.test(w.trackName)) s -= 60;
  if (c.trackCount === 1) s += 8;
  if (c.collectionName && COMPILATION_RE.test(c.collectionName)) s -= 20;
  if (c.releaseDate) {
    const yr = new Date(c.releaseDate).getFullYear();
    if (!Number.isNaN(yr)) s += Math.min(5, Math.max(0, (new Date().getFullYear() - yr) / 5));
  }
  return s;
}

async function jget(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) { await new Promise(r=>setTimeout(r,1500)); continue; }
      return await r.json();
    } catch { await new Promise(r=>setTimeout(r,1500)); }
  }
  return { results: [] };
}

async function lookupOne(id) {
  const j = await jget(`https://itunes.apple.com/lookup?id=${id}&entity=song`);
  return (j.results || [])[0] || null;
}

async function searchOne(a, t, cc) {
  const j = await jget(`https://itunes.apple.com/search?term=${encodeURIComponent(`${t} ${a}`)}&country=${cc}&media=music&entity=song&limit=10`);
  return j.results || [];
}

async function audit(seed) {
  const [oldId, title, artist, genre, primary] = seed;
  const want = { trackName: title, artistName: artist };
  const isNumeric = /^\d{6,12}$/.test(oldId);

  let current = null;
  if (isNumeric) {
    current = await lookupOne(oldId);
    await new Promise(r=>setTimeout(r,800));
  }

  // Search for alternatives
  const stores = Array.from(new Set([detectStorefront(title, artist, 'us', genre), 'us']));
  let allResults = [];
  for (const cc of stores) {
    const results = await searchOne(artist, title, cc);
    allResults.push(...results);
    await new Promise(r=>setTimeout(r,800));
  }
  // Dedup by trackId
  const seen = new Set();
  const uniq = allResults.filter(r => { if (seen.has(r.trackId)) return false; seen.add(r.trackId); return true; });
  // Score and sort
  const ranked = uniq.map(r => ({ ...r, _s: score(r, want) }))
    .filter(r => r._s >= 80)
    .sort((a, b) => b._s - a._s);

  const best = ranked[0] || null;
  const currScore = current ? score(current, want) : -1;

  if (!best) {
    return {
      oldId, title, artist, genre, primary,
      status: 'NO_MATCH',
      currentColl: current?.collectionName ?? null,
    };
  }

  // Should we swap?
  const swap = !isNumeric || (best._s > currScore + 5) || (current && String(best.trackId) !== oldId);
  return {
    oldId, title, artist, genre, primary,
    status: swap ? 'SWAP' : 'KEEP',
    currentColl: current?.collectionName ?? null,
    currentScore: currScore,
    bestId: String(best.trackId),
    bestColl: best.collectionName,
    bestScore: best._s,
    bestCover: (best.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
    bestPreview: best.previewUrl,
    bestUrl: best.trackViewUrl,
    bestCollId: best.collectionId,
    bestTrackCount: best.trackCount,
    bestRelease: best.releaseDate?.slice(0, 10),
  };
}

const out = [];
for (const seed of SEEDS) {
  const r = await audit(seed);
  out.push(r);
  if (r.status === 'NO_MATCH') {
    console.error(`❓ NO_MATCH   ${r.oldId.padEnd(11)} ${r.title} / ${r.artist}`);
  } else if (r.status === 'KEEP') {
    console.error(`✅ KEEP       ${r.oldId.padEnd(11)} → ${r.bestColl}`);
  } else {
    const flag = r.bestId === r.oldId ? 'rescore' : 'swap';
    console.error(`🔄 SWAP[${flag}]  ${r.oldId.padEnd(11)} → ${r.bestId.padEnd(11)} (${r.bestColl})`);
    if (r.currentColl) console.error(`               was: ${r.currentColl}`);
  }
}

console.log('\n// ── verified seed pool ──');
for (const r of out) {
  if (r.status === 'NO_MATCH') {
    console.log(`  // FIXME mk('${r.oldId}', ${JSON.stringify(r.title)}, ${JSON.stringify(r.artist)}, '${r.genre}', '${r.primary}'),`);
  } else {
    console.log(`  mk('${r.bestId}', ${JSON.stringify(r.title)}, ${JSON.stringify(r.artist)}, '${r.genre}', '${r.primary}'), // ${r.bestColl}`);
  }
}
