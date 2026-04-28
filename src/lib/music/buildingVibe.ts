/**
 * Building-tag → music vibe deriver.
 *
 * Reads the OSM-derived `BuildingTag[]` already attached to every
 * `OSMBuilding` (see `osmLoader.ts:extractPOITags`) and translates
 * the tenant mix into:
 *
 *   • `keywords`     — short list of iTunes search seeds the engine
 *                      can use as ADDITIONAL queries (e.g. a Japanese
 *                      restaurant gets `["city pop", "tokyo jazz"]`)
 *   • `genreBoosts`  — extra weight added to the existing city-vibe
 *                      genre scores so the building's tenant mix can
 *                      *re-rank* the local pool without overriding it
 *   • `label`        — short human-readable summary used by the UI
 *                      (e.g. "Japanese Restaurant", "Hotel")
 *
 * The mapping is intentionally conservative: every entry has at most
 * 3 keywords + 1-2 genre boosts so we don't drown out the city-vibe
 * signal. Buildings with no recognized tags (residential / office /
 * generic) return an empty vibe so the engine falls back to pure
 * city-vibe behavior.
 *
 * Why this lives client-side and not in a database:
 *   • The OSM tags are already loaded into memory by osmLoader, so
 *     no extra HTTP call is required (zero-cost rule).
 *   • The mapping is small enough (~40 cases) that a JS lookup is
 *     faster than any DB roundtrip and trivially testable.
 *   • Adding a new cuisine or amenity → genre rule is one diff line.
 */

import type { BuildingTag } from '../geo/osmLoader';
import type { GenreKey } from '../../types';
import { buildingMood, moodKeywords, moodToGenreBoosts } from './tenantMood';
import { getCurrentTimeSnapshot } from '../../stores/useTimeStore';

export type BuildingVibe = {
  keywords: string[];
  genreBoosts: Map<GenreKey, number>;
  label: string | null;
};

const EMPTY_VIBE: BuildingVibe = {
  keywords: [],
  genreBoosts: new Map(),
  label: null,
};

/**
 * Translate the tenant mix of a building into music keywords + genre
 * weight boosts. Returns a fresh object every call (no shared state).
 *
 * NEW (2026-04-28): Cuisine-specific literal mappings have been
 * dropped. The previous code did things like "japanese restaurant
 * → city pop, korean → k-pop" — which felt mechanical and overrode
 * the city's actual musical identity (a Korean BBQ in Manhattan
 * should sound like Manhattan, not Seoul). The replacement uses
 * `tenantMood.ts`'s 4-D mood vector (energy / warmth / intimacy /
 * formality) weighted by the *current hour* against each tenant's
 * peak-traffic hour, then translates that mood into small additive
 * genre boosts. Combined with the city profile + weather / time-of-
 * day biases that recommendEngine already applies, the result
 * shifts mood without overwriting cultural identity.
 *
 * The `label` (used as the panel headline) still picks the most
 * specific human-readable tenant name so the UI surface is unchanged.
 */
export function deriveBuildingVibe(tags: BuildingTag[]): BuildingVibe {
  if (!tags || tags.length === 0) return { ...EMPTY_VIBE, genreBoosts: new Map() };

  // ── Mood-vector layer (the smart bit) ──
  // Combine every tenant tag into a single mood vector weighted by
  // proximity-to-peak-hour, then translate that to small genre boosts.
  // This is what gives the recommendation its situational feel —
  // morning vs night, cozy vs energetic — without ever touching the
  // city's musical identity.
  const time = getCurrentTimeSnapshot();
  const mood = buildingMood(tags, time?.hour ?? 14);
  const moodBoosts = mood ? moodToGenreBoosts(mood) : new Map<GenreKey, number>();
  const moodKws = mood ? moodKeywords(mood) : [];

  const keywords: string[] = [...moodKws];
  const boosts = new Map<GenreKey, number>(moodBoosts);
  let label: string | null = null;

  const addKw = (...kws: string[]) => {
    for (const k of kws) {
      if (!keywords.includes(k)) keywords.push(k);
    }
  };

  // ── Label resolution + venue-specific OVERLAYS ──
  // Most tenant categories now contribute only via the mood vector
  // above. A tiny set of venues with extremely strong musical
  // identity (cinema → soundtrack, religious → choral, club → club
  // hits) still gets a focused keyword/genre overlay because those
  // ARE the music, not just the mood. Cuisine ethnicity, cafe vs
  // restaurant flavor, etc. are intentionally NOT distinguished
  // here — that work is done by the mood vector.
  for (const tag of tags) {
    const lbl = tag.label.toLowerCase();

    // Food: label only. Cuisine ethnicity DELIBERATELY no longer
    // contributes to genre/keyword — that's the city profile's job.
    if (tag.category === 'food') {
      label = label ?? tag.label;
    }
    // Hotel: label only.
    else if (tag.category === 'hotel') {
      label = label ?? 'Hotel';
    }
    // Entertainment: a few venue types HAVE strong inherent musical
    // identity (cinema → soundtrack, religious → choral, club →
    // club hits). Those still get a focused overlay because the
    // music IS the venue, not just its mood.
    else if (tag.category === 'entertainment') {
      if (lbl.includes('cinema') || lbl.includes('theatre')) {
        addKw('soundtrack');
        boosts.set('soundtrack', (boosts.get('soundtrack') ?? 0) + 2.5);
      } else if (lbl.includes('club')) {
        addKw('club hits', 'edm');
        boosts.set('electronic', (boosts.get('electronic') ?? 0) + 2);
        boosts.set('hiphop', (boosts.get('hiphop') ?? 0) + 1.5);
      } else if (lbl.includes('museum') || lbl.includes('gallery')) {
        addKw('modern classical');
        boosts.set('classical', (boosts.get('classical') ?? 0) + 1.5);
      }
      label = label ?? tag.label;
    }
    // Religious: label only — the mood-vector layer already pulls
    // formality + low-energy → classical, no need for "gregorian"
    // search seeds (which mismatch most modern listeners anyway).
    else if (tag.category === 'religious') {
      label = label ?? tag.label;
    }
    // Education / Shop: label only.
    else if (tag.category === 'education' || tag.category === 'shop') {
      label = label ?? tag.label;
    }
    // office / residential / medical / government / industrial → no signal.
  }

  return { keywords: keywords.slice(0, 4), genreBoosts: boosts, label };
}
