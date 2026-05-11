/**
 * Tenant-mood vectors — the smart layer between OSM tenant tags
 * and song selection.
 *
 * Why this exists
 * ---------------
 * The previous approach in `buildingVibe.ts` did literal mapping:
 * "japanese restaurant → city pop", "korean restaurant → k-pop",
 * "club → techno". That's the kind of dumb 1:1 the spec explicitly
 * forbids — feels mechanical and stops working as soon as you
 * stand in a Korean restaurant in Manhattan and want to hear what
 * MANHATTAN feels like at 11pm in the rain.
 *
 * Better signal: collapse every tenant into a 4-dimensional mood
 * vector (`energy`, `warmth`, `intimacy`, `formality`) plus a
 * `peakHour`, then combine with the *moment* (current hour, weather)
 * to derive genre weights. The actual ethnic / cuisine flavor of
 * the tenant is no longer hard-coded — the city profile + RSS
 * popularity layer (in `recommendEngine.ts`) handles "what kind of
 * music plays in THIS city at THIS time", and the tenant just
 * shifts the mood envelope inside that.
 *
 * Result: a Korean BBQ in Manhattan at 11pm gets late-night
 * Manhattan jazz / r&b biased upward, NOT k-pop. A Japanese sushi
 * counter in Tokyo at noon gets midday Tokyo pop biased toward
 * gentle / intimate, NOT "city pop because it says japanese".
 */

import type { BuildingTag } from '../geo/osmLoader';
import type { GenreKey } from '../../types';

/** A point in 4-dim mood space + the hour of day this kind of place
 *  typically peaks at. All scalars are normalized 0..1. */
export type MoodVector = {
  /** 0 = quiet / contemplative, 1 = loud / active. */
  energy: number;
  /** 0 = transactional / cold, 1 = cozy / human. */
  warmth: number;
  /** 0 = open public floor, 1 = enclosed / private corner. */
  intimacy: number;
  /** 0 = casual, 1 = formal / dressy. */
  formality: number;
  /** Hour 0–23 when foot traffic for this kind of place tends to peak. */
  peakHour: number;
  /** Used as a label only — not for matching. */
  source: string;
};

/** Category presets. Each (category, label-keyword) pair maps to one
 *  vector. Cuisine specificity is intentionally NOT distinguished —
 *  Korean BBQ, Italian trattoria, ramen shop all share the
 *  "casual sit-down restaurant at dinner" mood. The geographic
 *  flavor comes from the city profile, not from this table. */
function vectorFor(tag: BuildingTag): MoodVector | null {
  const lbl = tag.label.toLowerCase();

  if (tag.category === 'food') {
    if (lbl.includes('cafe') || lbl.includes('coffee') || lbl.includes('bakery')) {
      return { energy: 0.40, warmth: 0.90, intimacy: 0.65, formality: 0.30, peakHour: 10, source: 'cafe' };
    }
    if (lbl.includes('bar') || lbl.includes('pub') || lbl.includes('izakaya') || lbl.includes('lounge')) {
      return { energy: 0.75, warmth: 0.65, intimacy: 0.70, formality: 0.40, peakHour: 22, source: 'bar' };
    }
    if (lbl.includes('fast food') || lbl.includes('food court')) {
      return { energy: 0.60, warmth: 0.35, intimacy: 0.20, formality: 0.10, peakHour: 13, source: 'fast' };
    }
    // Catch-all sit-down restaurant.
    return { energy: 0.55, warmth: 0.75, intimacy: 0.70, formality: 0.55, peakHour: 20, source: 'restaurant' };
  }

  if (tag.category === 'hotel') {
    return { energy: 0.30, warmth: 0.60, intimacy: 0.55, formality: 0.80, peakHour: 19, source: 'hotel' };
  }

  if (tag.category === 'entertainment') {
    if (lbl.includes('club')) {
      return { energy: 1.00, warmth: 0.40, intimacy: 0.40, formality: 0.20, peakHour: 1, source: 'club' };
    }
    if (lbl.includes('cinema') || lbl.includes('theatre')) {
      return { energy: 0.55, warmth: 0.55, intimacy: 0.75, formality: 0.65, peakHour: 20, source: 'cinema' };
    }
    if (lbl.includes('museum') || lbl.includes('gallery')) {
      return { energy: 0.20, warmth: 0.55, intimacy: 0.70, formality: 0.70, peakHour: 15, source: 'museum' };
    }
    if (lbl.includes('attraction')) {
      return { energy: 0.65, warmth: 0.55, intimacy: 0.30, formality: 0.30, peakHour: 14, source: 'attraction' };
    }
    return { energy: 0.55, warmth: 0.45, intimacy: 0.50, formality: 0.40, peakHour: 19, source: 'entertainment' };
  }

  if (tag.category === 'religious') {
    return { energy: 0.15, warmth: 0.50, intimacy: 0.65, formality: 0.95, peakHour: 11, source: 'religious' };
  }

  if (tag.category === 'education') {
    return { energy: 0.40, warmth: 0.55, intimacy: 0.45, formality: 0.55, peakHour: 13, source: 'education' };
  }

  if (tag.category === 'shop') {
    if (lbl.includes('streetwear') || lbl.includes('sneaker') || lbl.includes('skate')) {
      return { energy: 0.75, warmth: 0.50, intimacy: 0.30, formality: 0.20, peakHour: 16, source: 'streetwear' };
    }
    if (lbl.includes('mall') || lbl.includes('dept')) {
      return { energy: 0.65, warmth: 0.45, intimacy: 0.20, formality: 0.30, peakHour: 16, source: 'mall' };
    }
    return { energy: 0.55, warmth: 0.50, intimacy: 0.35, formality: 0.35, peakHour: 16, source: 'shop' };
  }

  // office / residential / medical / government / industrial → no signal.
  return null;
}

/** Average a list of mood vectors, weighted by `peakHour` proximity to
 *  the current hour so a coffee shop in a building dominated by
 *  offices doesn't get muted at 8 AM. Returns null when no tags
 *  carry mood signal. */
export function buildingMood(
  tags: BuildingTag[],
  currentHour: number,
): MoodVector | null {
  const vectors = tags.map(vectorFor).filter((v): v is MoodVector => v !== null);
  if (vectors.length === 0) return null;

  let totalW = 0;
  const acc = { energy: 0, warmth: 0, intimacy: 0, formality: 0, peakHour: 0 };
  for (const v of vectors) {
    // Distance on the clock face (0..12) — a club at 1 AM is "0 hours
    // away" from currentHour=1 and "11 hours away" from currentHour=12.
    const diff = Math.abs(((v.peakHour - currentHour + 12 + 24) % 24) - 12);
    const w = 1 + Math.max(0, 0.6 - diff / 20); // 1.0 .. 1.3
    totalW += w;
    acc.energy   += v.energy * w;
    acc.warmth   += v.warmth * w;
    acc.intimacy += v.intimacy * w;
    acc.formality+= v.formality * w;
    acc.peakHour += v.peakHour * w;
  }
  return {
    energy: acc.energy / totalW,
    warmth: acc.warmth / totalW,
    intimacy: acc.intimacy / totalW,
    formality: acc.formality / totalW,
    peakHour: acc.peakHour / totalW,
    source: vectors.length === 1 ? vectors[0].source : 'mixed',
  };
}

/** Translate the building's mood into small additive genre weights.
 *  Numbers are deliberately small (max ±2) so they nudge the city
 *  profile + RSS popularity ranking in `recommendEngine.ts` without
 *  ever overriding it — the city's identity always wins. */
export function moodToGenreBoosts(mood: MoodVector): Map<GenreKey, number> {
  const boosts = new Map<GenreKey, number>();
  const bump = (g: GenreKey, n: number) => {
    boosts.set(g, (boosts.get(g) ?? 0) + n);
  };

  // ── Energy axis ──
  if (mood.energy > 0.75) {
    bump('electronic', 2);
    bump('hiphop', 1.5);
    bump('pop', 1);
  } else if (mood.energy < 0.35) {
    bump('classical', 2);
    bump('jazz', 1.5);
    bump('singer', 1);
  } else {
    bump('pop', 1);
    bump('alternative', 1);
  }

  // ── Warmth axis ──
  if (mood.warmth > 0.7) {
    bump('singer', 1.5);
    bump('jazz', 1);
    bump('alternative', 1);
  } else if (mood.warmth < 0.4) {
    bump('electronic', 1);
    bump('pop', 0.5);
  }

  // ── Intimacy axis ──
  if (mood.intimacy > 0.7) {
    bump('jazz', 1);
    bump('singer', 1);
    bump('alternative', 0.5);
  } else if (mood.intimacy < 0.3) {
    bump('pop', 1);
    bump('hiphop', 0.5);
  }

  // ── Formality axis ──
  if (mood.formality > 0.7) {
    bump('classical', 1);
    bump('jazz', 1);
  } else if (mood.formality < 0.3) {
    bump('hiphop', 1);
    bump('electronic', 0.5);
  }

  return boosts;
}

/** Light, abstract keyword seeds for the iTunes-search pool. NOT
 *  cuisine-specific. The point is to surface MOOD-matched long-tail
 *  songs the RSS chart misses, while letting the city profile and
 *  RSS chart drive the cultural identity. Capped at 2. */
export function moodKeywords(mood: MoodVector): string[] {
  const ks: string[] = [];
  if (mood.energy > 0.75) ks.push('night drive', 'late club');
  else if (mood.energy < 0.3) ks.push('quiet morning', 'soft piano');
  else if (mood.warmth > 0.7 && mood.intimacy > 0.6) ks.push('cozy lo-fi');
  else if (mood.formality > 0.7) ks.push('elegant');
  else ks.push('chill afternoon');
  return ks.slice(0, 2);
}
