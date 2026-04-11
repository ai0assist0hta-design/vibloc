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
 */
export function deriveBuildingVibe(tags: BuildingTag[]): BuildingVibe {
  if (!tags || tags.length === 0) return { ...EMPTY_VIBE, genreBoosts: new Map() };

  const keywords: string[] = [];
  const boosts = new Map<GenreKey, number>();
  let label: string | null = null;

  const bump = (g: GenreKey, n: number) => {
    boosts.set(g, (boosts.get(g) ?? 0) + n);
  };
  const addKw = (...kws: string[]) => {
    for (const k of kws) {
      if (!keywords.includes(k)) keywords.push(k);
    }
  };

  for (const tag of tags) {
    const lbl = tag.label.toLowerCase();

    // ── Food / drink — cuisine-specialized ──
    if (tag.category === 'food') {
      if (lbl.includes('japanese') || lbl.includes('sushi') || lbl.includes('ramen') || lbl.includes('izakaya')) {
        addKw('city pop', 'tokyo jazz');
        bump('pop', 2);
        bump('jazz', 1);
      } else if (lbl.includes('korean')) {
        addKw('k-pop', 'k-hiphop', 'korean indie');
        bump('pop', 2);
        bump('hiphop', 1);
      } else if (lbl.includes('italian') || lbl.includes('pizza')) {
        addKw('italian', 'bossa nova');
        bump('jazz', 2);
        bump('classical', 1);
      } else if (lbl.includes('french')) {
        addKw('french chanson', 'parisian jazz');
        bump('jazz', 2);
        bump('classical', 1);
      } else if (lbl.includes('chinese') || lbl.includes('dim sum')) {
        addKw('mandopop', 'chinese pop');
        bump('pop', 2);
      } else if (lbl.includes('mexican') || lbl.includes('latin') || lbl.includes('spanish')) {
        addKw('latin', 'reggaeton', 'latin trap');
        bump('pop', 2);
        bump('hiphop', 1);
      } else if (lbl.includes('indian')) {
        addKw('bollywood', 'indian fusion');
        bump('pop', 1);
        bump('electronic', 1);
      } else if (lbl.includes('thai') || lbl.includes('vietnamese') || lbl.includes('asian')) {
        addKw('chillwave', 'asian indie');
        bump('alternative', 2);
      } else if (lbl.includes('middle east') || lbl.includes('turkish') || lbl.includes('arab')) {
        addKw('arabic', 'oud');
        bump('classical', 1);
        bump('electronic', 1);
      } else if (lbl.includes('bar') || lbl.includes('pub')) {
        addKw('bar jazz', 'lounge', 'live');
        bump('jazz', 2);
        bump('rock', 1);
      } else if (lbl.includes('cafe')) {
        addKw('lo-fi cafe', 'acoustic');
        bump('singer', 2);
        bump('jazz', 1);
      } else if (lbl.includes('fast food')) {
        addKw('pop hits');
        bump('pop', 1);
      } else {
        addKw('dinner jazz');
        bump('jazz', 1);
      }
      label = label ?? tag.label;
    }
    // ── Hotel ──
    else if (tag.category === 'hotel') {
      addKw('hotel lounge', 'chill ambient');
      bump('jazz', 2);
      bump('electronic', 1);
      label = label ?? 'Hotel';
    }
    // ── Entertainment ──
    else if (tag.category === 'entertainment') {
      if (lbl.includes('cinema')) {
        addKw('soundtrack', 'film score');
        bump('soundtrack', 3);
      } else if (lbl.includes('theatre')) {
        addKw('broadway', 'musical');
        bump('soundtrack', 2);
        bump('classical', 1);
      } else if (lbl.includes('museum')) {
        addKw('ambient', 'modern classical');
        bump('classical', 2);
      } else if (lbl.includes('club')) {
        // Nightclubs split between EDM rooms and hip-hop rooms
        // almost everywhere — bias both so the search pool reflects
        // the actual club music ecosystem, not just techno.
        addKw('club hits', 'hip hop club', 'edm');
        bump('electronic', 2);
        bump('hiphop', 2);
      } else if (lbl.includes('attraction')) {
        addKw('travel', 'world');
        bump('world', 2);
        bump('pop', 1);
      } else {
        addKw('lounge');
        bump('electronic', 1);
      }
      label = label ?? tag.label;
    }
    // ── Religious ──
    else if (tag.category === 'religious') {
      addKw('sacred', 'choir', 'gregorian');
      bump('classical', 3);
      label = label ?? tag.label;
    }
    // ── Education ──
    else if (tag.category === 'education') {
      addKw('lo-fi study', 'indie campus');
      bump('alternative', 2);
      bump('jazz', 1);
      label = label ?? tag.label;
    }
    // ── Shop ──
    else if (tag.category === 'shop') {
      if (lbl.includes('mall') || lbl.includes('dept')) {
        addKw('shopping pop', 'top hits');
        bump('pop', 2);
      } else if (lbl.includes('electronics')) {
        addKw('synthwave', 'future bass');
        bump('electronic', 2);
      } else if (
        lbl.includes('streetwear') ||
        lbl.includes('sneaker') ||
        lbl.includes('skate')
      ) {
        // Streetwear/sneaker culture is hip-hop-anchored across
        // every major city — Supreme NYC, A Bathing Ape Tokyo,
        // Round Two LA. Boost hiphop hard when these tags appear.
        addKw('streetwear hiphop', 'sneaker rap');
        bump('hiphop', 3);
      } else {
        addKw('retail pop');
        bump('pop', 1);
      }
      label = label ?? tag.label;
    }
    // office / residential / medical / government / industrial → no boost
  }

  return { keywords: keywords.slice(0, 4), genreBoosts: boosts, label };
}
