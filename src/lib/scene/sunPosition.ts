/**
 * Solar position calculator
 * Calculates sun azimuth & altitude from lat/lon + date/time
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Timezone offsets for each city (IANA timezone names) */
export const CITY_TIMEZONES: Record<string, string> = {
  shinjuku: 'Asia/Tokyo',
  shibuya: 'Asia/Tokyo',
  itaewon: 'Asia/Seoul',
  gangnam: 'Asia/Seoul',
  manhattan: 'America/New_York',
  la: 'America/Los_Angeles',
};

export type SunPosition = {
  /** Altitude angle in degrees (0 = horizon, 90 = zenith, negative = below horizon) */
  altitude: number;
  /** Azimuth in degrees from North, clockwise (0=N, 90=E, 180=S, 270=W) */
  azimuth: number;
  /** Whether sun is above horizon */
  isDay: boolean;
  /** Normalized time 0-24 */
  hour: number;
};

/**
 * Calculate sun position for a given date, lat, lon
 * Uses simplified astronomical algorithm (accurate to ~1 degree)
 */
export function calcSunPosition(date: Date, lat: number, lon: number): SunPosition {
  // Day of year
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);

  // Hours in UTC decimal
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  // Solar declination (approximation)
  const declination = -23.45 * Math.cos(DEG * (360 / 365) * (dayOfYear + 10));

  // Equation of time (minutes) — approximate
  const B = DEG * (360 / 365) * (dayOfYear - 81);
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

  // Solar time
  const solarNoon = 12 - lon / 15; // UTC hour of solar noon
  const solarTime = utcHours - solarNoon + eot / 60 + 12;

  // Hour angle (degrees, 15 deg/hour from solar noon)
  const hourAngle = (solarTime - 12) * 15;

  // Altitude
  const latRad = lat * DEG;
  const decRad = declination * DEG;
  const haRad = hourAngle * DEG;

  const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD;

  // Azimuth
  const cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
    (Math.cos(latRad) * Math.cos(altitude * DEG));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD;
  if (hourAngle > 0) azimuth = 360 - azimuth;

  // Local time for display
  const hour = (solarTime + (lon / 15) - eot / 60) % 24;

  return {
    altitude,
    azimuth,
    isDay: altitude > -6, // civil twilight
    hour: (hour + 24) % 24,
  };
}

/**
 * Get current local time in a city's timezone
 */
export function getCityLocalTime(timezone: string): Date {
  const now = new Date();
  const str = now.toLocaleString('en-US', { timeZone: timezone });
  return new Date(str);
}

/**
 * Create a Date object for a specific hour in a timezone
 * Keeps today's date but sets time to the given hour
 */
export function dateAtHour(hour: number, timezone: string): Date {
  const now = new Date();
  // Get today in the target timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);

  const year = parseInt(parts.find(p => p.type === 'year')!.value);
  const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1;
  const day = parseInt(parts.find(p => p.type === 'day')!.value);

  // Get timezone offset at that date
  const localMidnight = new Date(year, month, day);
  const tzStr = localMidnight.toLocaleString('en-US', { timeZone: timezone });
  const tzDate = new Date(tzStr);
  const offsetMs = localMidnight.getTime() - tzDate.getTime();

  // Create date at the desired local hour
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  const target = new Date(year, month, day, h, m, 0);
  // Adjust back to UTC
  return new Date(target.getTime() + offsetMs);
}

/**
 * Convert sun position to Three.js directional light position
 * Returns [x, y, z] for the light
 */
export function sunToLightPosition(sun: SunPosition, distance = 500): [number, number, number] {
  const altRad = sun.altitude * DEG;
  const azRad = sun.azimuth * DEG;

  // Azimuth: 0=North(+Z), 90=East(+X), 180=South(-Z), 270=West(-X)
  const y = Math.sin(altRad) * distance;
  const horizontal = Math.cos(altRad) * distance;
  const x = Math.sin(azRad) * horizontal;
  const z = Math.cos(azRad) * horizontal;

  // Clamp Y: minimum height prevents overly long shadows at sunrise/sunset
  // At low sun angles the shadow stretches unrealistically far, so we keep
  // the light elevated enough that shadow length stays reasonable.
  const clampedY = Math.max(distance * 0.45, y);
  // Scale horizontal component to preserve direction but match new altitude
  const scale = clampedY > y ? (clampedY / Math.max(y, 1)) : 1;
  const finalHoriz = horizontal / Math.max(scale, 1);
  const fx = Math.sin(azRad) * finalHoriz;
  const fz = Math.cos(azRad) * finalHoriz;
  return [fx, clampedY, fz];
}

/**
 * Format hour to display string like "14:30"
 */
export function formatHour(h: number): string {
  const hours = Math.floor(h);
  const mins = Math.floor((h - hours) * 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Get sky color transition based on sun altitude
 * Returns { bg, fogColor, isDark }
 */
export function getSkyState(altitude: number) {
  // Night: altitude < -6
  // Twilight: -6 to 0
  // Golden hour: 0 to 10
  // Day: > 10

  if (altitude < -6) {
    return { isDark: true, skyFactor: 0 };
  } else if (altitude < 0) {
    // Civil twilight — transition
    const t = (altitude + 6) / 6; // 0 to 1
    return { isDark: t < 0.5, skyFactor: t * 0.3 };
  } else if (altitude < 10) {
    // Golden hour / sunrise-sunset
    const t = altitude / 10; // 0 to 1
    return { isDark: false, skyFactor: 0.3 + t * 0.7 };
  } else {
    return { isDark: false, skyFactor: 1 };
  }
}
