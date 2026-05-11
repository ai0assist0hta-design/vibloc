// Cross-check every seed in TRACK_POOL against Apple's catalog in ONE
// batch call. iTunes /lookup accepts comma-separated trackIds and
// returns each track's full metadata + collection info — so we can
// audit the entire pool without burning the 20 req/min search rate.
//
// Output: a markdown table comparing what the seed says vs what Apple
// actually serves for that trackId, flagging any mismatch.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFile = join(__dirname, '..', 'src', 'features', 'dev', 'seedAgents.ts');
const src = readFileSync(seedFile, 'utf8');

// Extract every mk(...) line from the TRACK_POOL block.
const poolMatch = src.match(/const TRACK_POOL[\s\S]*?\n\];/);
if (!poolMatch) { console.error('TRACK_POOL not found'); process.exit(1); }
const lines = poolMatch[0].split('\n')
  .map(l => l.match(/mk\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\)/))
  .filter(Boolean)
  .map(m => ({ id: m[1], title: m[2], artist: m[3], genre: m[4], primary: m[5] }));

const numericIds = lines.filter(l => /^\d{6,12}$/.test(l.id));
const textIds = lines.filter(l => !/^\d{6,12}$/.test(l.id));

console.error(`Found ${lines.length} seeds (${numericIds.length} numeric, ${textIds.length} text)`);

// ─── Batch lookup ─────────────────────────────────────────────────────
// iTunes accepts up to ~600 comma-separated IDs. We do it in one shot.
const idCsv = numericIds.map(l => l.id).join(',');
const url = `https://itunes.apple.com/lookup?id=${idCsv}&entity=song`;

console.error(`Batch lookup: ${numericIds.length} IDs → 1 request`);
const r = await fetch(url);
if (!r.ok) { console.error(`HTTP ${r.status}`); process.exit(1); }
const data = await r.json();
const apple = new Map(); // id → result
for (const item of data.results || []) {
  if (item.wrapperType === 'track') apple.set(String(item.trackId), item);
}
console.error(`Apple returned ${apple.size}/${numericIds.length} tracks`);

// ─── Normalization for matching ──────────────────────────────────────
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/\([^)]*\)/g,' ').replace(/\[[^\]]*\]/g,' ')
    .replace(/[^\p{L}\p{N}]+/gu,' ')
    .trim().replace(/\s+/g,' ');
}
const VARIANT_RE = /\b(remix|cover|karaoke|tribute|live|instrumental|acoustic|remaster(?:ed)?|edit|version|mix|sped\s*up|slowed|deluxe edition|chopped)\b/i;
const COMPILATION_RE = /\b(compilation|various artists|now that's what|hits|greatest|the best of|deluxe|bonus track|anniversary|reissue|collection|dj\s*mix|boiler\s*room|today'?s hits|workout|playlist|mixed by|ministry of sound|continuous mix|pres\.|presents)\b/i;

// ─── Diagnose every seed ─────────────────────────────────────────────
const rows = [];
for (const seed of numericIds) {
  const a = apple.get(seed.id);
  if (!a) {
    rows.push({ ...seed, status: '❌ MISSING', appleTitle: '(not in catalog)', appleArtist: '', appleColl: '', flags: 'id not found' });
    continue;
  }
  const flags = [];
  if (normalize(a.trackName) !== normalize(seed.title)) flags.push('title-mismatch');
  if (!normalize(a.artistName).includes(normalize(seed.artist).split(' ')[0])) flags.push('artist-mismatch');
  if (VARIANT_RE.test(a.trackName) && !VARIANT_RE.test(seed.title)) flags.push('variant');
  if (COMPILATION_RE.test(a.collectionName || '')) flags.push('compilation');
  const status = flags.length === 0 ? '✅ OK' : `⚠️  ${flags.join(',')}`;
  rows.push({
    ...seed, status,
    appleTitle: a.trackName,
    appleArtist: a.artistName,
    appleColl: a.collectionName,
    flags: flags.join(',') || 'clean',
    coverUrl: (a.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
    appleUrl: a.trackViewUrl,
  });
}

// ─── Markdown report ─────────────────────────────────────────────────
console.log('# Seed cover cross-check\n');
console.log(`Generated against iTunes \`/lookup?id=${numericIds.length}-IDs\` in one batch call. Each row compares what the seed says vs the metadata Apple actually serves for that trackId.\n`);
console.log('| status | seed title / artist | apple title | apple collection | flags |');
console.log('|---|---|---|---|---|');
for (const r of rows) {
  const seedLbl = `**${r.title}** / ${r.artist}`;
  const appleLbl = r.appleTitle === r.title ? r.appleTitle : `~~${r.appleTitle}~~`;
  console.log(`| ${r.status} | ${seedLbl} | ${appleLbl} | ${r.appleColl} | ${r.flags} |`);
}

// ─── Summary ─────────────────────────────────────────────────────────
const bad = rows.filter(r => r.status !== '✅ OK');
console.log(`\n## Summary: ${rows.filter(r => r.status === '✅ OK').length}/${rows.length} clean, ${bad.length} need review\n`);
for (const r of bad) {
  console.log(`- **${r.title} / ${r.artist}** (\`${r.id}\`)  →  ${r.appleTitle} / ${r.appleArtist}  *[${r.appleColl}]*`);
  console.log(`  flags: ${r.flags}`);
  if (r.coverUrl) console.log(`  cover: ${r.coverUrl}`);
}

if (textIds.length) {
  console.log(`\n## Text-id seeds (resolve at runtime, not validated here)`);
  for (const t of textIds) console.log(`- ${t.title} / ${t.artist} (\`${t.id}\`)`);
}
