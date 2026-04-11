/**
 * Static "what does this place sound like" profile.
 *
 * Why static and not Last.fm geo?
 * --------------------------------
 * The user's hard constraint is "요금은 항상 0원 유지" — zero cost,
 * zero key required. Last.fm's geo endpoint is free but needs an
 * API key (free to get, but still a key); MusicBrainz needs a User-
 * Agent header and is rate-limited to 1 req/s. To stay both free
 * AND key-free we ship a small hand-curated table here that maps
 * each playable area in `App.tsx` to:
 *
 *   • `topGenres`     — 5–6 GenreKey buckets ordered by dominance.
 *                       Used by the engine to score RSS picks AND
 *                       by the City Vibe block (top 3 shown as chips).
 *   • `moodKeywords`  — short free-text scene / ethnic-cuisine seeds
 *                       used as additional iTunes search keywords so
 *                       the local pool reflects the neighborhood's
 *                       actual cultural mix (Harlem jazz, Itaewon
 *                       multiculturalism, LA Koreatown, Shibuya
 *                       streetwear, etc.) and not just the country
 *                       chart.
 *
 * The values are seeded from public reference points:
 *   • Every Noise at Once — Sound of {City} pages
 *   • Apple Music city editorial collections
 *   • Wikipedia articles on each district's music + ethnic history
 *   • Resident Advisor + RA Asia coverage of club scenes
 *
 * Updating this file is the single source of truth for "city → vibe":
 * if a new area is added in App.tsx, add it here too.
 */

import type { CityVibe } from './trackTypes';
import type { CityAreaKey } from '../geo/osmLoader';

export const CITY_VIBES: Record<CityAreaKey, CityVibe> = {
  shinjuku: {
    city: 'Shinjuku',
    country: 'JP',
    // Tokyo's busiest district — city pop legacy + late-night Golden
    // Gai jazz bars + Tower Records electronic section + the Korean
    // Town in adjacent Shin-Okubo. Rock and classical round it out
    // via Bunkamura Orchard Hall.
    topGenres: ['jpop', 'pop', 'anime', 'rock', 'electronic', 'jazz'],
    moodKeywords: ['city pop', 'tokyo jazz', 'shibuya-kei', 'anime ost', 'neon synth'],
  },
  shibuya: {
    city: 'Shibuya',
    country: 'JP',
    // Youth + fashion epicenter. J-pop center, shibuya-kei indie
    // legacy, Cypher / Womb-area hip-hop. Streetwear culture pulls
    // a lot of US hip-hop and R&B too.
    topGenres: ['jpop', 'pop', 'hiphop', 'rnb', 'alternative', 'electronic'],
    moodKeywords: ['shibuya-kei', 'j-indie', 'city pop', 'j-hiphop', 'tokyo street'],
  },
  itaewon: {
    city: 'Itaewon',
    country: 'KR',
    // Seoul's most international district — Middle Eastern, African,
    // Western expat communities concentrated here. The club strip is
    // Korean hip-hop + global hip-hop; Hannam-dong indie cafés round
    // it out. Latin and Afrobeat actually chart here.
    topGenres: ['kpop', 'hiphop', 'rnb', 'pop', 'electronic', 'world'],
    moodKeywords: ['k-hiphop', 'late night seoul', 'global hiphop', 'afrobeat', 'k-rnb'],
  },
  gangnam: {
    city: 'Gangnam',
    country: 'KR',
    // K-pop label HQ district (SM, JYP nearby). Octagon / Arena dance
    // clubs + Apgujeong R&B studios. Glamour, luxury, hallyu wave
    // exports. K-hiphop scene (AOMG / H1GHR MUSIC HQ) is centered here.
    topGenres: ['kpop', 'pop', 'hiphop', 'electronic', 'rnb', 'classical'],
    moodKeywords: ['k-pop', 'k-hiphop', 'edm seoul', 'hallyu', 'apgujeong'],
  },
  manhattan: {
    city: 'Manhattan',
    country: 'US',
    // The classic NYC trifecta plus the long-tail: jazz (Village,
    // Harlem), hip-hop (Bronx-rooted, Manhattan-distributed — the
    // genre's birthplace), Brooklyn-adjacent indie. Italian Harlem +
    // East Harlem (Spanish Harlem) + Chinatown + Lower East Side
    // punk + Broadway musicals all contribute.
    topGenres: ['hiphop', 'pop', 'rnb', 'jazz', 'latin', 'soundtrack'],
    moodKeywords: ['ny hiphop', 'harlem jazz', 'boom bap', 'broadway', 'salsa nyc'],
  },
  la: {
    city: 'Los Angeles',
    country: 'US',
    // West Coast hip-hop center (Compton/Watts roots, Death Row /
    // TDE / Dr. Dre lineage), Silver Lake / Echo Park indie, Low
    // End Theory beat-scene legacy. Latino majority pulls Latin /
    // regional Mexican; Koreatown contributes K-pop crossover.
    // Surf rock and West Coast jazz live here too.
    topGenres: ['hiphop', 'latin', 'pop', 'rnb', 'alternative', 'electronic'],
    moodKeywords: ['west coast', 'g-funk', 'beat scene', 'sunset lo-fi', 'regional mexican'],
  },
};

/** Lookup helper that never throws. Falls back to a generic "global"
 *  vibe for unknown areas (defensive — the static table covers every
 *  area key currently shipped). */
export function getCityVibe(area: CityAreaKey): CityVibe {
  return (
    CITY_VIBES[area] ?? {
      city: 'Unknown',
      country: 'US',
      topGenres: ['pop', 'alternative', 'electronic', 'jazz', 'rnb'],
      moodKeywords: ['indie', 'lo-fi', 'global'],
    }
  );
}
