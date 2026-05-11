// One-shot resolver: hit iTunes Search for every seed track and
// print a corrected seed-pool snippet. Picks the storefront based
// on script (Hangul/Kana → KR/JP), strict scoring identical to
// VIBLOC's coverArt.ts, and prints a verified trackId for each.

const SEEDS = [
  ['1440857781', 'Blinding Lights',         'The Weeknd',         'pop',         'Pop'],
  ['1440831203', 'Sunflower',               'Post Malone',        'pop',         'Pop'],
  ['1440857784', 'As It Was',               'Harry Styles',       'pop',         'Pop'],
  ['1500401823', 'Glimpse of Us',           'Joji',               'pop',         'Pop'],
  ['1500401826', 'Snowman',                 'Sia',                'pop',         'Pop'],
  ['p-flowers',  'Flowers',                 'Miley Cyrus',        'pop',         'Pop'],
  ['p-vampire',  'vampire',                 'Olivia Rodrigo',     'pop',         'Pop'],
  ['1500401818', 'Dynamite',                'BTS',                'kpop',        'K-Pop'],
  ['1664031596', 'Cupid',                   'FIFTY FIFTY',        'kpop',        'K-Pop'],
  ['1592163497', 'Kitsch',                  'IVE',                'kpop',        'K-Pop'],
  ['1664031597', 'After LIKE',              'IVE',                'kpop',        'K-Pop'],
  ['k-haewa',    'Haegeum',                 'Agust D',            'kpop',        'K-Pop'],
  ['k-supershy', 'Super Shy',               'NewJeans',           'kpop',        'K-Pop'],
  ['k-ditto',    'Ditto',                   'NewJeans',           'kpop',        'K-Pop'],
  ['1535215575', 'Plastic Love',            'Mariya Takeuchi',    'jpop',        'J-Pop'],
  ['1535215576', 'Stay With Me',            'Miki Matsubara',     'jpop',        'J-Pop'],
  ['1500401820', 'Lemon',                   'Kenshi Yonezu',      'jpop',        'J-Pop'],
  ['1535215577', 'Subtitle',                'Official髭男dism',    'jpop',        'J-Pop'],
  ['j-mixed',    'Mixed Nuts',              'Official髭男dism',    'jpop',        'J-Pop'],
  ['j-idol',     'アイドル',                 'YOASOBI',            'jpop',        'J-Pop'],
  ['j-kaiju',    '怪獣の花唄',                'Vaundy',             'jpop',        'J-Pop'],
  ['1440857782', 'Late Night Tales',        'Yebba',              'rnb',         'R&B/Soul'],
  ['1500401821', 'Get You',                 'Daniel Caesar',      'rnb',         'R&B/Soul'],
  ['1500401822', 'Pink + White',            'Frank Ocean',        'rnb',         'R&B/Soul'],
  ['r-snooze',   'Snooze',                  'SZA',                'rnb',         'R&B/Soul'],
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
  ['s-anti',     'Anti-Hero',               'Taylor Swift',       'singer',      'Singer/Songwriter'],
  ['s-lover',    'lovely',                  'Billie Eilish',      'singer',      'Singer/Songwriter'],
  ['s-skinny',   'Skinny',                  'Billie Eilish',      'singer',      'Singer/Songwriter'],
  ['l-tusa',     'Tusa',                    'Karol G & Nicki Minaj', 'latin',    'Latin'],
  ['l-despac',   'Despacito',               'Luis Fonsi',         'latin',       'Latin'],
  ['o-mononoke', 'もののけ姫',                '久石譲',              'soundtrack',  'Soundtrack'],
  ['o-rain',     "Comptine d'un autre été", 'Yann Tiersen',       'soundtrack',  'Soundtrack'],
  ['rk-bohemian','Bohemian Rhapsody',       'Queen',              'rock',        'Rock'],
  ['rk-radiohd', 'Creep',                   'Radiohead',          'rock',        'Rock'],
];

const HANGUL_RE = /[가-힯ᄀ-ᇿ]/;
const KANA_RE   = /[぀-ヿ]/;
const CJK_RE    = /[㐀-鿿]/;
const VARIANT_RE = /\b(remix|cover|karaoke|tribute|live|instrumental|acoustic|remaster(?:ed)?|edit|version|mix|sped\s*up|slowed)\b/i;

function detectStorefront(t, a, fallback, genre) {
  const both = `${t} ${a}`;
  if (HANGUL_RE.test(both)) return 'kr';
  if (KANA_RE.test(both)) return 'jp';
  if (genre === 'kpop') return 'kr';
  if (genre === 'jpop') return 'jp';
  if (CJK_RE.test(both)) return 'jp';
  return fallback;
}

function normalize(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\bfeat\.?\b.*$/i, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().replace(/\s+/g, ' ');
}

function score(cand, want) {
  const ct = normalize(cand.trackName), ca = normalize(cand.artistName);
  const wt = normalize(want.trackName), wa = normalize(want.artistName);
  let s = 0;
  if (ct === wt) s += 50;
  else if (ct.startsWith(wt) || wt.startsWith(ct)) s += 35;
  else if (ct.includes(wt) || wt.includes(ct)) s += 22;
  if (ca === wa) s += 50;
  else if (ca.includes(wa) || wa.includes(ca)) s += 38;
  else {
    const parts = ca.split(/[,&]| and | x | feat | featuring /).map(p => p.trim()).filter(Boolean);
    if (parts.some(p => p === wa || p.includes(wa) || wa.includes(p))) s += 32;
  }
  if (VARIANT_RE.test(cand.trackName) && !VARIANT_RE.test(want.trackName)) s -= 45;
  return s;
}

async function searchOne(artist, title, country) {
  const term = `${title} ${artist}`;
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&media=music&entity=song&limit=10`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const j = await r.json();
  return j.results || [];
}

async function resolve(seed) {
  const [oldId, title, artist, genre, primary] = seed;
  const want = { trackName: title, artistName: artist };
  const stores = Array.from(new Set([detectStorefront(title, artist, 'us', genre), 'us', 'jp', 'kr']));
  let best = null;
  for (const cc of stores) {
    let results;
    try { results = await searchOne(artist, title, cc); } catch { continue; }
    for (const r of results) {
      const s = score(r, want);
      if (!best || s > best.score) best = { score: s, t: r };
    }
    if (best && best.score >= 95) break;
    await new Promise(r => setTimeout(r, 250)); // rate limit kindness
  }
  if (!best || best.score < 80) {
    return { oldId, title, artist, genre, primary, status: 'NO_MATCH', score: best?.score ?? 0 };
  }
  return {
    oldId, title, artist, genre, primary,
    status: 'OK',
    score: best.score,
    trackId: String(best.t.trackId),
    appleTitle: best.t.trackName,
    appleArtist: best.t.artistName,
  };
}

const out = [];
for (const seed of SEEDS) {
  const r = await resolve(seed);
  out.push(r);
  console.error(`${r.status.padEnd(8)} score=${String(r.score).padStart(3)} ${r.oldId.padEnd(11)} → ${r.trackId ?? '???'.padEnd(10)}  ${r.title} / ${r.artist}${r.appleTitle && (r.appleTitle !== r.title || r.appleArtist !== r.artist) ? `  ⚠ apple: ${r.appleTitle} / ${r.appleArtist}` : ''}`);
}

// Emit replacement seed pool
console.log('\n// ── Generated seed pool (verified iTunes trackIds) ──');
for (const r of out) {
  if (r.status !== 'OK') {
    console.log(`  // FIXME no-match (${r.score}) — needs manual lookup:`);
    console.log(`  // mk('${r.oldId}', ${JSON.stringify(r.title)}, ${JSON.stringify(r.artist)}, '${r.genre}', '${r.primary}'),`);
    continue;
  }
  console.log(`  mk('${r.trackId}', ${JSON.stringify(r.title)}, ${JSON.stringify(r.artist)}, '${r.genre}', '${r.primary}'),`);
}
