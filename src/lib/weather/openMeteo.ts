/**
 * Open-Meteo current-weather adapter — the ONLY weather source we ship.
 *
 * Why Open-Meteo
 * --------------
 *   • 0원, no API key, no signup, no per-user quota
 *   • CORS-enabled out of the box (Access-Control-Allow-Origin: *)
 *   • Returns the standardized WMO weather codes (0–99) which map
 *     cleanly to a small icon set
 *   • Updated hourly server-side; we cache 10 min client-side
 *   • Same `forecast` endpoint covers every city we currently render
 *     (Tokyo, Seoul, NYC, LA) without per-region routing
 *
 * Endpoint contract (documented at open-meteo.com/en/docs):
 *   GET https://api.open-meteo.com/v1/forecast
 *     ?latitude=<LAT>
 *     &longitude=<LON>
 *     &current=weather_code,temperature_2m,wind_speed_10m,precipitation
 *     &timezone=auto
 *
 * Response shape (only fields we read):
 *   {
 *     current: {
 *       weather_code: number,        // WMO 0..99
 *       temperature_2m: number,      // °C
 *       wind_speed_10m: number,      // km/h
 *       precipitation: number,       // mm
 *     }
 *   }
 *
 * The categorize step collapses the WMO codes into the 6-bucket icon
 * set the UI actually wants (clear, cloudy, rain, snow, thunder + a
 * separate windy flag). Failure resolves to `null` so the call site
 * can hide the indicator instead of showing an error.
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — Open-Meteo updates hourly
const CACHE_PREFIX = 'vibloc.weather.v1.';

/**
 * Six visual buckets the UI cares about. Wind is intentionally a
 * separate flag rather than a category so a windy-but-clear day
 * still shows CLR rather than collapsing into WIND.
 */
export type WeatherCategory =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'thunder'
  | 'fog';

export type WeatherSnapshot = {
  category: WeatherCategory;
  /** True when 10 m wind speed exceeds 25 km/h. Composable with any
   *  category — the UI may show the wind glyph alongside the main
   *  category icon. */
  windy: boolean;
  /** Temperature in degrees Celsius — kept for the recommendation
   *  engine, NOT shown in the UI. */
  tempC: number;
  /** Raw WMO code, kept for diagnostics + future fine-grained rules. */
  code: number;
  /** Wind speed in km/h. */
  windKmh: number;
  /** Precipitation rate in mm/h (sum of rain + snow + showers in the
   *  past hour, per Open-Meteo's `current.precipitation` field).
   *  Drives the rain particle density / fall speed in WeatherFX so a
   *  drizzle reads visually different from a downpour.
   *  Reference scale: <0.5 mm/h drizzle, 0.5–2.5 light, 2.5–10 mod,
   *  10+ heavy, 20+ torrential. */
  precipitationMm: number;
  /** Wall-clock fetch timestamp (ms epoch). */
  fetchedAt: number;
};

/**
 * Convert a WMO weather code into one of the six UI buckets. The
 * mapping follows the official WMO 4677 table that Open-Meteo uses.
 * Documented codes:
 *
 *    0       Clear sky
 *    1       Mainly clear            → clear
 *    2       Partly cloudy           → cloudy
 *    3       Overcast                → cloudy
 *    45, 48  Fog / depositing rime
 *    51-57   Drizzle (any intensity / freezing)     → rain
 *    61-67   Rain (any intensity / freezing)        → rain
 *    71-77   Snow fall / snow grains                → snow
 *    80-82   Rain showers (slight / mod / violent)  → rain
 *    85-86   Snow showers                           → snow
 *    95      Thunderstorm
 *    96, 99  Thunderstorm with hail
 */
function categorize(code: number): WeatherCategory {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain';
  if (code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'thunder';
  // Anything Open-Meteo invents in the future falls back to cloudy
  // rather than showing nothing — least surprising default.
  return 'cloudy';
}

// ─── Cache ───────────────────────────────────────────────────────────
// sessionStorage is fine here: weather is per-session and we don't
// want to ship stale data across browser restarts. The 10 min TTL is
// matched to Open-Meteo's own hourly refresh rate plus a margin so
// quick area toggles don't burn requests.

function cacheKey(lat: number, lon: number): string {
  // Round to 0.1° (~11 km) so nearby buildings in the same city share
  // the same cache entry — no point fetching weather for every block.
  const r = (n: number) => Math.round(n * 10) / 10;
  return `${CACHE_PREFIX}${r(lat)}_${r(lon)}`;
}

function readCache(lat: number, lon: number): WeatherSnapshot | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(cacheKey(lat, lon));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeatherSnapshot;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(lat: number, lon: number, snap: WeatherSnapshot): void {
  try {
    sessionStorage.setItem(cacheKey(lat, lon), JSON.stringify(snap));
  } catch {
    /* full / disabled / private mode — ignore */
  }
}

/**
 * Fetch the current weather for a coordinate. Returns null on any
 * failure (network, parse, abort). Cached aggressively so live mode
 * tick + area changes don't spam the public endpoint.
 */
export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<WeatherSnapshot | null> {
  const cached = readCache(lat, lon);
  if (cached) return cached;

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'weather_code,temperature_2m,wind_speed_10m,precipitation',
    timezone: 'auto',
  });
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      signal,
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: {
        weather_code?: number;
        temperature_2m?: number;
        wind_speed_10m?: number;
        precipitation?: number;
      };
    };
    const cur = data.current;
    if (!cur || typeof cur.weather_code !== 'number') return null;

    const code = cur.weather_code;
    const tempC = typeof cur.temperature_2m === 'number' ? cur.temperature_2m : 0;
    const windKmh = typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : 0;
    const precipitationMm =
      typeof cur.precipitation === 'number' && Number.isFinite(cur.precipitation)
        ? Math.max(0, cur.precipitation)
        : 0;
    const snap: WeatherSnapshot = {
      category: categorize(code),
      windy: windKmh >= 25,
      tempC,
      code,
      windKmh,
      precipitationMm,
      fetchedAt: Date.now(),
    };
    writeCache(lat, lon, snap);
    return snap;
  } catch {
    return null;
  }
}

// (removed `weatherEmoji` 2026-04-27 — UI now renders Lucide icons
//  directly via `weatherIcon` in components/ui/TimeSlider.tsx.)

/**
 * Human-readable label, used as the tooltip on the indicator. Kept
 * minimal — no temperature, no precipitation amount — because the
 * user explicitly asked for "icon only, no graphic chrome".
 */
export function weatherLabel(snap: WeatherSnapshot): string {
  const base = (() => {
    switch (snap.category) {
      case 'clear':   return 'Clear';
      case 'cloudy':  return 'Cloudy';
      case 'rain':    return 'Rain';
      case 'snow':    return 'Snow';
      case 'thunder': return 'Thunderstorm';
      case 'fog':     return 'Fog';
      default:        return 'Cloudy';
    }
  })();
  return snap.windy ? `${base} · windy` : base;
}
