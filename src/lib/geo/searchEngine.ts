import type { OSMBuilding } from './osmLoader';

/**
 * VIBLOC search ranker.
 *
 * A small, dependency-free ranking layer over the loaded buildings array.
 * Designed to feel like the kind of relevance work a real search engine
 * does, while staying fast enough to run on every keystroke against ~10k
 * documents in the browser.
 *
 * Features
 * --------
 * - **Field weighting** (name > tenant > tag label > address). The same
 *   token hit on a name is worth more than on an address.
 * - **BM25-style length normalization** so a one-word "Cafe" doesn't beat
 *   a perfectly-matched 80-char address out of pure brevity.
 * - **Bigram (character n-gram) Jaccard** as a fuzzy fallback when no
 *   token substring match exists. Catches typos and partial spellings
 *   ("스타박스" → "스타벅스", "kabukcho" → "kabukicho").
 * - **Cross-language synonyms** for common category words so 백화점 /
 *   デパート / dept store all reach the same buildings.
 * - **Popularity boost** from height and levels — taller / better-known
 *   buildings rise on ambiguous queries.
 * - **Authoritative provenance** bonus — buildings whose address came
 *   from their own addr:* tags or manual override beat neighbors that
 *   borrowed the same address (preserved from the previous ranker).
 *
 * The ranker is intentionally pure and synchronous — autocomplete and
 * full-search both call the same function.
 */

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a string for fuzzy comparison.
 * - Lowercase
 * - Unify dash variants (fullwidth, en/em dash, hyphen, JP long sound mark
 *   when used as a separator) to ASCII '-'
 * - Strip postcode markers and common punctuation
 * - Collapse whitespace
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[〒,()。·、\.]/g, ' ')
    .replace(/[‐-‒–—―−ー－]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'japan', 'korea', 'south', 'usa', 'us', 'tokyo', 'seoul', 'new', 'york',
  'city', 'chome', 'ny', 'ca', 'street', 'st', 'ave', 'avenue', 'rd', 'road',
  'gu', 'dong', 'ro', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'and', 'or',
]);

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[\s\-]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

// ---------------------------------------------------------------------------
// Bigram fuzzy
// ---------------------------------------------------------------------------

/**
 * Build a multiset of character bigrams. Uses padding so the first/last
 * char each contribute one bigram, making short strings (≤2 chars) still
 * comparable.
 */
function bigrams(s: string): string[] {
  if (!s) return [];
  const padded = ` ${s} `;
  const out: string[] = [];
  for (let i = 0; i < padded.length - 1; i++) out.push(padded.slice(i, i + 2));
  return out;
}

/**
 * Jaccard similarity of two bigram multisets, treated as sets. Cheap and
 * surprisingly effective for typo tolerance across Latin / CJK.
 */
function bigramSim(a: string, b: string): number {
  if (!a || !b) return 0;
  const A = new Set(bigrams(a));
  const B = new Set(bigrams(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Word-aware bigram similarity. Splits the haystack into whitespace-
 * delimited words and returns the MAX bigram Jaccard between the needle
 * and any individual word. This prevents long multi-word names like
 * "amuse kabukicho bldg" from diluting the score for a typo of one word
 * ("kabukcho" → matches "kabukicho" with sim ≈ 0.8 instead of ≈ 0.35).
 */
function bigramSimWordwise(needle: string, haystack: string): number {
  if (!needle || !haystack) return 0;
  // Whole-string sim as a floor (catches CJK names that have no spaces).
  let best = bigramSim(needle, haystack);
  if (best >= 0.95) return best;
  const words = haystack.split(/\s+/);
  for (const w of words) {
    if (!w || Math.abs(w.length - needle.length) > Math.max(needle.length, 4)) continue;
    const sim = bigramSim(needle, w);
    if (sim > best) best = sim;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Synonyms — cross-language category aliases
// ---------------------------------------------------------------------------

/**
 * Tokens that should match each other across languages. Key is the
 * normalized lowercase form the user might type; values are the aliases
 * the ranker injects into the query token list before scoring.
 *
 * This is deliberately small and curated — we only encode terms that are
 * (a) ambiguous across English/Korean/Japanese and (b) commonly typed.
 * Anything else falls back to the bigram fuzzy layer.
 */
const SYNONYMS: Record<string, string[]> = {
  // Department store / mall
  'dept': ['백화점', 'デパート', '百貨店'],
  'department': ['백화점', 'デパート', '百貨店'],
  '백화점': ['dept', 'department', 'デパート', '百貨店'],
  'デパート': ['dept', 'department', '백화점', '百貨店'],
  '百貨店': ['dept', 'department', '백화점', 'デパート'],
  'mall': ['쇼핑몰', 'ショッピングモール'],
  '쇼핑몰': ['mall'],

  // Cafe / coffee
  'cafe': ['카페', 'カフェ', 'coffee', '커피', 'コーヒー'],
  '카페': ['cafe', 'カフェ', 'coffee', '커피'],
  'カフェ': ['cafe', '카페', 'coffee'],
  'coffee': ['cafe', '카페', 'カフェ', '커피', 'コーヒー'],
  '커피': ['coffee', 'cafe', '카페'],
  'コーヒー': ['coffee', 'cafe', 'カフェ'],

  // Restaurant
  'restaurant': ['식당', 'レストラン', '음식점', '飲食店'],
  '식당': ['restaurant', 'レストラン'],
  'レストラン': ['restaurant', '식당'],
  '음식점': ['restaurant', '식당'],

  // Hotel
  'hotel': ['호텔', 'ホテル'],
  '호텔': ['hotel', 'ホテル'],
  'ホテル': ['hotel', '호텔'],

  // Hospital
  'hospital': ['병원', '病院'],
  '병원': ['hospital', '病院'],
  '病院': ['hospital', '병원'],

  // School
  'school': ['학교', '学校'],
  '학교': ['school', '学校'],
  '学校': ['school', '학교'],

  // Bar / pub / izakaya
  'bar': ['바', 'バー', '居酒屋', 'izakaya'],
  '居酒屋': ['izakaya', 'bar', 'pub'],
  'izakaya': ['居酒屋', 'bar', 'pub'],
  'pub': ['bar', '居酒屋'],

  // Station — extremely common in JP queries
  'station': ['駅', '역'],
  '駅': ['station', '역'],
  '역': ['station', '駅'],
};

/**
 * Build one synonym GROUP per base token. A group is the base token plus
 * any cross-language aliases. The ranker treats a group as a single unit
 * for coverage purposes — hitting any member counts as one hit — so a
 * synonym match never penalizes a building that matches the original
 * spelling.
 */
function buildTokenGroups(tokens: string[]): string[][] {
  return tokens.map((tok) => {
    const aliases = SYNONYMS[tok];
    if (!aliases || aliases.length === 0) return [tok];
    const set = new Set<string>([tok]);
    for (const a of aliases) set.add(normalize(a));
    return Array.from(set);
  });
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

type FieldDoc = {
  name: string;          // building.name (normalized)
  address: string;       // building.address (normalized)
  tenants: string;       // joined tenant business names (normalized)
  labels: string;        // joined generic tag labels (normalized)
  // Raw lengths for length-normalization
  totalLen: number;
};

function buildDoc(b: OSMBuilding): FieldDoc {
  const name = normalize(b.name || '');
  const address = normalize(b.address || '');
  const tenantParts: string[] = [];
  const labelParts: string[] = [];
  for (const t of b.tags) {
    if (t.name) tenantParts.push(normalize(t.name));
    if (t.label) labelParts.push(normalize(t.label));
  }
  const tenants = tenantParts.join(' ');
  const labels = labelParts.join(' ');
  return {
    name,
    address,
    tenants,
    labels,
    totalLen: name.length + address.length + tenants.length + labels.length,
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const FIELD_WEIGHTS = {
  name: 3.0,
  tenants: 2.5,
  labels: 1.2,
  address: 1.8,
} as const;

const PHRASE_BONUS = 600;          // Whole query appears as substring
const TOKEN_HIT_BASE = 80;         // Per-token-group field hit
const FUZZY_THRESHOLD = 0.55;      // Min bigram Jaccard to count as fuzzy hit
const FUZZY_HIT_BASE = 35;         // Per-token fuzzy hit (cheaper than exact)
const AUTH_ADDR_BONUS = 60;        // Bonus when authoritative AND query hit address

/**
 * Score a single building against the (already normalized) query.
 * Returns 0 when nothing matches; otherwise a positive number where higher
 * means more relevant.
 */
function scoreDoc(
  doc: FieldDoc,
  qPhrase: string,
  groups: string[][],
  popularity: number,
  authoritative: boolean,
): number {
  if (!qPhrase && groups.length === 0) return 0;
  if (doc.totalLen === 0) return 0;

  let score = 0;
  let matchedFields = 0;
  let matchedGroups = 0;
  let addressHit = false;

  // ---- Phrase substring (rare but very strong) ----
  if (qPhrase.length >= 2) {
    if (doc.name.includes(qPhrase)) {
      score += PHRASE_BONUS * FIELD_WEIGHTS.name;
      matchedFields++;
    } else if (doc.tenants.includes(qPhrase)) {
      score += PHRASE_BONUS * FIELD_WEIGHTS.tenants;
      matchedFields++;
    } else if (doc.address.includes(qPhrase)) {
      score += PHRASE_BONUS * FIELD_WEIGHTS.address;
      matchedFields++;
      addressHit = true;
    } else if (doc.labels.includes(qPhrase)) {
      score += PHRASE_BONUS * FIELD_WEIGHTS.labels;
      matchedFields++;
    }
  }

  // ---- Token-group hits across fields ----
  // A "group" is a base token plus its cross-language synonyms. The
  // group counts as ONE hit if any member matches; this prevents synonym
  // expansion from inflating the coverage denominator.
  for (const group of groups) {
    let bestField = 0;
    let groupHitAddress = false;
    for (const tok of group) {
      if (!tok) continue;
      if (doc.name.includes(tok)) bestField = Math.max(bestField, TOKEN_HIT_BASE * FIELD_WEIGHTS.name);
      if (doc.tenants.includes(tok)) bestField = Math.max(bestField, TOKEN_HIT_BASE * FIELD_WEIGHTS.tenants);
      if (doc.labels.includes(tok)) bestField = Math.max(bestField, TOKEN_HIT_BASE * FIELD_WEIGHTS.labels);
      if (doc.address.includes(tok)) {
        bestField = Math.max(bestField, TOKEN_HIT_BASE * FIELD_WEIGHTS.address);
        groupHitAddress = true;
      }
    }

    if (bestField > 0) {
      score += bestField;
      matchedGroups++;
      if (groupHitAddress) addressHit = true;
      continue;
    }

    // Fuzzy fallback: only on the base token (group[0]) and only if it's
    // long enough to be discriminative. Compared word-wise against name
    // and tenants (addresses are too noisy for char-level fuzzy).
    const base = group[0];
    if (base && base.length >= 3) {
      const sim = Math.max(
        bigramSimWordwise(base, doc.name),
        bigramSimWordwise(base, doc.tenants),
      );
      if (sim >= FUZZY_THRESHOLD) {
        score += FUZZY_HIT_BASE * sim * FIELD_WEIGHTS.name;
        matchedGroups++;
      }
    }
  }

  // Require at least one signal of relevance — either a phrase hit or a
  // token-group hit. (Pure popularity should never surface a building.)
  if (score === 0) return 0;

  // ---- BM25-ish length normalization ----
  // Slightly favor shorter, more specific docs on ties without crushing
  // long-but-perfectly-matched addresses.
  const lengthPenalty = 1 / (1 + Math.log(1 + doc.totalLen / 40));
  score *= 0.6 + 0.4 * lengthPenalty;

  // ---- Multi-group coverage requirement ----
  // If the user typed several distinct base tokens, we expect most to hit
  // SOMEWHERE on a relevant building. Drop matches that hit fewer than
  // half of them.
  if (groups.length >= 2) {
    const coverage = matchedGroups / groups.length;
    if (coverage < 0.5) return 0;
    score *= 0.6 + 0.4 * coverage;
  }

  // ---- Popularity boost (small, log-scaled) ----
  score += popularity;

  // ---- Authoritative provenance — narrow & additive ----
  // Only kicks in when the query actually hit the address field, so
  // identical-address neighbors are disambiguated, but the bonus never
  // drowns out a perfect name match elsewhere.
  if (authoritative && addressHit) score += AUTH_ADDR_BONUS;

  // Tiny tiebreaker for matches that span multiple fields
  if (matchedFields >= 2) score += 5;

  return score;
}

function popularityBoost(b: OSMBuilding): number {
  const h = b.height || 0;
  const lv = b.levels || 0;
  // Cap so a 600m building doesn't get 600x the boost.
  const cappedH = Math.min(h, 250);
  return Math.log(1 + cappedH) * 4 + Math.log(1 + lv) * 2;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type RankedResult = {
  building: OSMBuilding;
  score: number;
};

export type RankOptions = {
  /** Maximum number of results to return. Defaults to all positive-scoring. */
  limit?: number;
  /** Minimum score threshold. Defaults to 0 (any positive match). */
  minScore?: number;
};

/**
 * Rank a building array against a free-text query.
 *
 * Stateless: takes the same buildings array the rest of the app holds.
 * Designed to be cheap enough to call on every keystroke for autocomplete.
 */
export function rankBuildings(
  query: string,
  buildings: OSMBuilding[],
  options: RankOptions = {},
): RankedResult[] {
  const { limit, minScore = 0 } = options;
  const qPhrase = normalize(query);
  const baseTokens = tokenize(query);
  const groups = buildTokenGroups(baseTokens);

  if (!qPhrase && groups.length === 0) return [];

  const out: RankedResult[] = [];
  for (const b of buildings) {
    const doc = buildDoc(b);
    const pop = popularityBoost(b);
    const s = scoreDoc(doc, qPhrase, groups, pop, b.addressOriginal);
    if (s > minScore) out.push({ building: b, score: s });
  }

  out.sort((a, b) => b.score - a.score);
  return limit ? out.slice(0, limit) : out;
}

/**
 * Convenience: pick the single best match (or null).
 */
export function bestMatch(query: string, buildings: OSMBuilding[]): OSMBuilding | null {
  const r = rankBuildings(query, buildings, { limit: 1 });
  return r.length > 0 ? r[0].building : null;
}
