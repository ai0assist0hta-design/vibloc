#!/usr/bin/env node
/**
 * Audit each shipped HEADZ GLB and emit an exact LAYER_AVAILABILITY
 * table for src/features/avatar/avatarConfig.ts. Solves the drift
 * problem where the hand-maintained table claimed variants that the
 * GLB exporter actually filtered out (heavy vert limit, weird name
 * suffixes, source-file contamination).
 *
 * Usage:
 *   node scripts/headz/audit-glb.mjs
 *
 * Reports per character:
 *   • Hair / Glasses / Hat / Earrings / Beard / Mustache indices
 *     present in the GLB, ready to paste into LAYER_AVAILABILITY.
 *   • Always-on parts (Body, Eyes, Cartoony Eyes, Eyebrow, Ears)
 *     — flags any character missing one (incomplete face).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const GLB_DIR = join(REPO, 'public', 'models', 'headz');

// Minimal GLB parser — just pulls mesh node names from the embedded
// JSON chunk. No three.js dependency needed for this audit.
function meshNamesInGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  const names = new Set();
  for (const n of (json.nodes || [])) if (n.name) names.add(n.name);
  for (const m of (json.meshes || [])) if (m.name) names.add(m.name);
  return [...names].filter((n) => n.startsWith('Geo_'));
}

// Strip Geo_<gender>_<tone>_ prefix → bare part name.
function strip(name) {
  return name.replace(/^Geo_(Female|Male)_(white|brown|black)_/i, '');
}

const ALWAYS_ON = ['Body', 'Eyes', 'Cartoony Eyes.L', 'Cartoony Eyes.R',
                   'Eyebrow', 'Ears'];

function audit(base) {
  const path = join(GLB_DIR, `${base}.glb`);
  let names;
  try { names = meshNamesInGlb(path); }
  catch (e) { return { base, error: e.message }; }
  const stripped = names.map(strip);
  const has = (re) => stripped.some((n) => re.test(n));

  // Hair: Hair.NNN OR Hair.NNN.MMM (treat double-suffix as same idx)
  // OR HairNNN (no dot, e.g. Hair011, Hair012)
  const hair = new Set();
  for (const n of stripped) {
    let m = n.match(/^Hair\.0*(\d+)(?:\.\d+)?$/);
    if (m) { hair.add(+m[1]); continue; }
    m = n.match(/^Hair0*(\d+)$/);
    if (m) hair.add(+m[1]);
  }
  const glasses = new Set();
  for (const n of stripped) {
    const m = n.match(/^Glasses\.0*(\d+)$/);
    if (m) glasses.add(+m[1]);
  }
  const beard = new Set();
  for (const n of stripped) {
    const m = n.match(/^Beard0*(\d+)$/);
    if (m) beard.add(+m[1]);
  }
  const mustache = new Set();
  for (const n of stripped) {
    const m = n.match(/^Mustache\.0*(\d+)$/) || n.match(/^Moustache0*(\d+)$/);
    if (m) mustache.add(+m[1]);
  }

  const missing = ALWAYS_ON.filter((part) => {
    const re = new RegExp('^' + part.replace(/\./g, '\\.') + '$');
    return !has(re);
  });

  return {
    base,
    sizeKB: Math.round(readFileSync(path).length / 1024),
    hair: [...hair].sort((a, b) => a - b),
    glasses: [...glasses].sort((a, b) => a - b),
    hat: has(/^Hat$/),
    earrings: has(/^Earrings$/),
    beard: [...beard].sort((a, b) => a - b),
    mustache: [...mustache].sort((a, b) => a - b),
    missing_always_on: missing,
    raw: stripped,
  };
}

const BASES = ['f-white', 'f-black', 'm-white', 'm-black'];
const reports = BASES.map(audit);

console.log('\n=== HEADZ GLB Audit ===\n');
for (const r of reports) {
  if (r.error) { console.log(`${r.base}: ERROR ${r.error}`); continue; }
  console.log(`${r.base}  (${r.sizeKB} KB)`);
  console.log(`  hair      : [${r.hair.join(', ')}]`);
  console.log(`  glasses   : [${r.glasses.join(', ')}]`);
  console.log(`  hat       : ${r.hat}`);
  console.log(`  earrings  : ${r.earrings}`);
  console.log(`  beard     : [${r.beard.join(', ')}]`);
  console.log(`  mustache  : [${r.mustache.join(', ')}]`);
  if (r.missing_always_on.length)
    console.log(`  ⚠ MISSING : ${r.missing_always_on.join(', ')}`);
}

console.log('\n=== Paste into avatarConfig.ts ===\n');
console.log('export const LAYER_AVAILABILITY: Record<AvatarBase, {');
console.log('  hair: number[]; glasses: number[]; hat: boolean;');
console.log('  earrings: boolean; beard: number[]; mustache: number[];');
console.log('}> = {');
for (const r of reports) {
  if (r.error) continue;
  console.log(`  '${r.base}': { hair: [${r.hair.join(',')}], glasses: [${r.glasses.join(',')}], hat: ${r.hat}, earrings: ${r.earrings}, beard: [${r.beard.join(',')}], mustache: [${r.mustache.join(',')}] },`);
}
// Brown bases mirror Black per .blend audit
const fb = reports.find((r) => r.base === 'f-black');
const mb = reports.find((r) => r.base === 'm-black');
if (fb && !fb.error) console.log(`  'f-brown': { hair: [${fb.hair.join(',')}], glasses: [${fb.glasses.join(',')}], hat: ${fb.hat}, earrings: ${fb.earrings}, beard: [${fb.beard.join(',')}], mustache: [${fb.mustache.join(',')}] },`);
if (mb && !mb.error) console.log(`  'm-brown': { hair: [${mb.hair.join(',')}], glasses: [${mb.glasses.join(',')}], hat: ${mb.hat}, earrings: ${mb.earrings}, beard: [${mb.beard.join(',')}], mustache: [${mb.mustache.join(',')}] },`);
console.log('};');
