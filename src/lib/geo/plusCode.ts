/**
 * Open Location Code (Plus Code) encoder.
 *
 * Plus Codes are an open, public-domain geocoding system created by Google.
 * They turn any lat/lng into a short alphanumeric code that resolves to a
 * specific area on Earth (10-character codes ≈ 14 m × 14 m at the equator).
 *
 * Why VIBLOC ships its own implementation
 * ---------------------------------------
 * 1. **Privacy.** The whole point of Plus Codes for us is that they're
 *    deterministic from lat/lng — no API call, no third-party leak. Pulling
 *    in `open-location-code` from npm would work, but we already insist on a
 *    minimal supply chain (see SECURITY.md), and the algorithm is small.
 * 2. **Universality.** Both Google Maps and Apple Maps accept Plus Codes as
 *    search input. So even when our composed address text doesn't match
 *    Google's canonical form for that building, the user can copy the Plus
 *    Code and land on the exact same spot.
 * 3. **License.** The Plus Code algorithm is published by Google under
 *    Apache 2.0 (https://github.com/google/open-location-code). This file
 *    is a clean reimplementation of the encoder portion only, following
 *    the public spec.
 *
 * What we don't ship: the decoder, the shortener, the recovery functions.
 * VIBLOC only ever needs to GENERATE codes from coordinates we already have.
 */

const CODE_ALPHABET = '23456789CFGHJMPQRVWX';
const LATITUDE_MAX = 90;
const LONGITUDE_MAX = 180;
const PAIR_CODE_LENGTH = 10;
const SEPARATOR_POSITION = 8;
const SEPARATOR = '+';

/**
 * Resolution in degrees of each successive pair of digits. Each step is
 * 20× finer than the previous one (matching the 20-character alphabet).
 * This is the canonical lookup table from the public OLC spec.
 */
const PAIR_RESOLUTIONS = [20.0, 1.0, 0.05, 0.0025, 0.000125];

/**
 * Encode a lat/lng pair into an Open Location Code string.
 *
 * The default 10-character precision (e.g. "8Q7XMP6Q+QV") corresponds to
 * roughly a 13.7 m × 13.7 m grid cell — fine enough to distinguish
 * adjacent buildings in any city VIBLOC renders.
 *
 * For lookups in Google / Apple Maps, prefer pairing the code with a
 * locality token: `"8Q7XMP6Q+QV Tokyo"` resolves more reliably than the
 * raw code, which is technically global but searched ambiguously.
 */
export function encodePlusCode(lat: number, lon: number): string {
  // Clip and normalize.
  let latitude = clipLatitude(lat);
  let longitude = normalizeLongitude(lon);
  // Pole edge case: subtract one cell so the encoder doesn't overflow.
  if (latitude === LATITUDE_MAX) {
    latitude -= PAIR_RESOLUTIONS[PAIR_RESOLUTIONS.length - 1];
  }
  // Shift to positive ranges so the integer division below is well-defined.
  latitude += LATITUDE_MAX;       // [0, 180]
  longitude += LONGITUDE_MAX;     // [0, 360]

  let code = '';
  for (let pair = 0; pair < PAIR_CODE_LENGTH / 2; pair++) {
    const placeValue = PAIR_RESOLUTIONS[pair];
    // Latitude digit
    let latDigit = Math.floor(latitude / placeValue);
    if (latDigit > 19) latDigit = 19;
    latitude -= latDigit * placeValue;
    code += CODE_ALPHABET.charAt(latDigit);
    // Longitude digit
    let lonDigit = Math.floor(longitude / placeValue);
    if (lonDigit > 19) lonDigit = 19;
    longitude -= lonDigit * placeValue;
    code += CODE_ALPHABET.charAt(lonDigit);
  }

  // Insert the '+' separator after the 8th character.
  return code.slice(0, SEPARATOR_POSITION) + SEPARATOR + code.slice(SEPARATOR_POSITION);
}

function clipLatitude(latitude: number): number {
  return Math.min(Math.max(latitude, -LATITUDE_MAX), LATITUDE_MAX);
}

function normalizeLongitude(longitude: number): number {
  let lon = longitude;
  while (lon < -LONGITUDE_MAX) lon += LONGITUDE_MAX * 2;
  while (lon >= LONGITUDE_MAX) lon -= LONGITUDE_MAX * 2;
  return lon;
}

// ---------------------------------------------------------------------------
// Map deeplink helpers
// ---------------------------------------------------------------------------

/**
 * Build a Google Maps search URL that lands on the exact lat/lng. We use
 * the documented `?api=1&query=<lat>,<lng>` form because it's stable across
 * desktop and mobile and never depends on text address parsing — so the
 * pin always lands on the right building, even when our displayed address
 * differs from Google's canonical form.
 */
export function googleMapsLink(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
}

/**
 * Apple Maps deeplink. `?ll=` drops a pin at the coordinates; `?q=` adds a
 * label. Works on iOS / macOS Maps and falls back to maps.apple.com on
 * other platforms.
 */
export function appleMapsLink(lat: number, lon: number, label?: string): string {
  const params = new URLSearchParams();
  params.set('ll', `${lat},${lon}`);
  if (label) params.set('q', label);
  return `https://maps.apple.com/?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Additional free deeplinks (no API key, no billing)
//
// Every helper below is a pure URL constructor — they hit nothing at build
// time and the user's browser is what eventually opens the target. There is
// no quota and no Google Maps Platform billing involvement, because the
// "Maps URL Scheme" is a documented public surface (the Google Maps URLs
// guide explicitly states it's free of API charges).
// ---------------------------------------------------------------------------

/** Google Street View deeplink. Lets the user verify *visually* whether
 *  VIBLOC's coordinate actually lands on the right building. */
export function googleStreetViewLink(lat: number, lon: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
}

/** Key-free embeddable Street View URL.
 *
 *  How this works
 *  --------------
 *  The legacy `maps.google.com/maps?...output=svembed` URL still exists,
 *  but it now 301-redirects to the canonical Maps Embed PB form:
 *
 *      https://www.google.com/maps/embed?origin=mfe&pb=!6m6!1m5!2m2!1d<LAT>!2d<LON>!4f<HEADING>!5f1
 *
 *  This is the **panoID-free Street View embed format**. Unlike the
 *  more common `!6m8!1m7!1s<panoID>!...` format which needs a real
 *  panoID up front, the `!6m6!1m5!2m2!1d!2d!4f!5f` form lets Google's
 *  server-side picker resolve the closest pano from lat/lng. It
 *  returns HTTP 200 with no `X-Frame-Options` header, so it iframe-
 *  embeds without an API key.
 *
 *  Verified 2026-04-08 via curl + an injected test iframe in the
 *  running preview.
 *
 *  The catch
 *  ---------
 *  Google's server-side picker honors lat/lng but **does not have a
 *  keyless `source=outdoor` flag** — it picks the closest pano even
 *  when that closest pano is a user-uploaded indoor Photo Sphere
 *  ("angel tran"-style). The fix is to never hand it a coordinate
 *  that's on top of a known indoor capture: we run the OSM subway-
 *  entrance sanitizer (`lib/subwayAvoid.ts`) AND the road-snap in
 *  `lib/streetViewViewpoint.ts` BEFORE calling this function. The
 *  sanitized coord lands on a clean stretch of road where the closest
 *  pano is a Google car capture.
 */
export function googleStreetViewEmbed(lat: number, lon: number, headingDeg = 0): string {
  // PB field meanings, verified empirically against Google's render
  // 2026-04-09 by injecting candidate URLs into a live iframe:
  //   !6m7  — Street View embed envelope (7 inner fields)
  //   !1m6  — viewpoint container (6 inner fields)
  //   !2m2  — coordinate pair container
  //   !1d<LAT>      — latitude (decimal degrees)
  //   !2d<LON>      — longitude (decimal degrees)
  //   !3f<HEADING>  — compass heading (0=N, 90=E)
  //   !4f<PITCH>    — vertical pitch (0 = level horizon, +up, -down)
  //   !5f<ZOOM>     — FOV / zoom factor. Smaller = wider angle.
  //                   0.5 ≈ ~90° horizontal FOV.
  //
  // Pre-fix bug: this URL used to put HEADING in the !4f slot, which
  // is actually the PITCH field. Result: every embed tilted UP by
  // (headingDeg) degrees so the camera looked at the sky / building
  // rooflines instead of straight ahead. The fix is to put heading
  // in !3f and pin pitch to 0 in !4f.
  const heading = ((headingDeg % 360) + 360) % 360;
  return `https://www.google.com/maps/embed?origin=mfe&pb=!6m7!1m6!2m2!1d${lat}!2d${lon}!3f${heading}!4f0!5f0.5`;
}

/** Mapillary embed URL — community-sourced street imagery, CC-BY-SA, no API
 *  key. Coords-based form auto-picks the closest user-contributed image so we
 *  don't have to do an async lookup ourselves. Coverage is strong in NYC/LA,
 *  moderate in Tokyo, sparse in Seoul — used as a fallback when Google has
 *  no imagery for the building.
 *
 *  Sourced via the recommendation in the 2024-2026 OSS street-view embed
 *  research; verified iframe-friendly (no X-Frame-Options block). */
export function mapillaryEmbed(lat: number, lon: number): string {
  return `https://www.mapillary.com/embed?map_style=Mapillary+light&style=photo&lat=${lat}&lng=${lon}&z=17`;
}

/** OpenStreetMap official embed iframe URL — uses OSM's documented
 *  /export/embed.html surface, completely free and key-less. Always renders
 *  *something* (the map itself, with a marker) so it's the universal
 *  fallback when neither Google nor Mapillary has street-level imagery. */
export function osmEmbed(lat: number, lon: number, zoomDelta = 0.0008): string {
  const south = (lat - zoomDelta).toFixed(6);
  const north = (lat + zoomDelta).toFixed(6);
  const west = (lon - zoomDelta * 2).toFixed(6);
  const east = (lon + zoomDelta * 2).toFixed(6);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${west},${south},${east},${north}&layer=mapnik&marker=${lat},${lon}`;
}

/** Google Maps walking-directions deeplink. Origin is omitted so Google Maps
 *  uses the user's current location, which is the most useful default for a
 *  "take me here" button. */
export function googleDirectionsWalkLink(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;
}

/** OpenStreetMap permalink with the marker centred on the building. Doubles
 *  as a one-click "fix this in OSM" entry point — useful when the user spots
 *  data that's wrong and wants to contribute upstream. */
export function osmPermalink(lat: number, lon: number, zoom = 19): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}

/** Bing Maps deeplink — included because Bing/Duck Duck Go use it as their
 *  default map provider, so users on those engines aren't redirected to
 *  Google. `cp` = center point, `lvl` = zoom. */
export function bingMapsLink(lat: number, lon: number): string {
  return `https://www.bing.com/maps?cp=${lat}~${lon}&lvl=18&sp=point.${lat}_${lon}`;
}

/** Naver Map deeplink (mobile-first; opens app on Android/iOS, web on
 *  desktop). Naver is the dominant map app in South Korea, so showing this
 *  for KR locations means the user lands in the app they actually use. */
export function naverMapLink(lat: number, lon: number, label?: string): string {
  // Web fallback URL — Naver's mobile app intercepts this on a phone.
  const name = label ? encodeURIComponent(label) : 'Building';
  return `https://map.naver.com/p?c=18.00,0,0,0,dh&searchCoord=${lon};${lat}&title=${name}`;
}

/** Kakao Map deeplink. Kakao is Korea's #2 map app and the default for
 *  KakaoTalk users — keeping it alongside Naver covers ~99% of KR users. */
export function kakaoMapLink(lat: number, lon: number): string {
  return `https://map.kakao.com/link/map/${lat},${lon}`;
}

/** Yahoo Japan Maps — Japan's most-used non-Google map app for native users
 *  who prefer the Japanese-language UI. */
export function yahooJapanMapLink(lat: number, lon: number): string {
  return `https://map.yahoo.co.jp/place?lat=${lat}&lon=${lon}&zoom=19`;
}

// ---------------------------------------------------------------------------
// Geohash — secondary portable identifier alongside Plus Code
//
// Plus Code is great for end users (Google/Apple Maps both accept it) but
// many open-source GIS tools standardize on Geohash. Generating both means
// our building IDs are portable into either ecosystem with no API call.
// ---------------------------------------------------------------------------

const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Encode lat/lng to a base-32 geohash. Default precision 9 ≈ 4.8 m × 4.8 m,
 *  comparable to a 10-character Plus Code. */
export function encodeGeohash(lat: number, lon: number, precision = 9): string {
  let latRange: [number, number] = [-90, 90];
  let lonRange: [number, number] = [-180, 180];
  let isLon = true;
  let bit = 0;
  let ch = 0;
  let hash = '';
  while (hash.length < precision) {
    if (isLon) {
      const mid = (lonRange[0] + lonRange[1]) / 2;
      if (lon >= mid) {
        ch = (ch << 1) | 1;
        lonRange = [mid, lonRange[1]];
      } else {
        ch = ch << 1;
        lonRange = [lonRange[0], mid];
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latRange = [mid, latRange[1]];
      } else {
        ch = ch << 1;
        latRange = [latRange[0], mid];
      }
    }
    isLon = !isLon;
    if (++bit === 5) {
      hash += GEOHASH_BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}
