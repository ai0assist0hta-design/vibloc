import { useEffect, useRef, useCallback } from 'react';
import {
  CITY_TIMEZONES,
  calcSunPosition,
  dateAtHour,
  sunToLightPosition,
  getSkyState,
  getCityLocalTime,
} from '../../lib/scene/sunPosition';
import { CITY_AREAS, type CityAreaKey } from '../../lib/geo/osmLoader';
import { useTimeStore } from '../../stores/useTimeStore';
import { useT } from '../../lib/app/i18n';

type TimeSliderProps = {
  area: CityAreaKey;
  /** Always-on indicator. Kept in props so existing call sites
   *  pass the same shape; toggle interaction has been removed. */
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onSunUpdate: (lightPos: [number, number, number], isDark: boolean) => void;
  darkMode: boolean;
};

/**
 * LIVE indicator (formerly TimeSlider).
 *
 * Design pass 2026-05-06 — the manual hour adjustment + live-toggle
 * UI was retired. The scene is always bound to real-time conditions
 * now, so this component is just a quiet pill that says `LIVE` +
 * shows the current weather glyph. The `onSunUpdate` + time-store
 * mirror still run on a 5-second tick so the city's lighting +
 * recommendation engine continue to track the wall clock.
 */
export function TimeSlider({ area, enabled, onSunUpdate, darkMode }: TimeSliderProps) {
  const t = useT();
  const tz = CITY_TIMEZONES[area] || 'UTC';
  const config = CITY_AREAS[area];

  const getCurrentHour = useCallback(() => {
    const local = getCityLocalTime(tz);
    return local.getHours() + local.getMinutes() / 60;
  }, [tz]);

  // Live clock tick — every 5 seconds we re-derive the sun position
  // from the wall clock and push it upstream. Gated on `enabled` so
  // turning the sidebar's Live mode toggle OFF actually freezes the
  // scene; previously the tick fired regardless and the sun jumped
  // back to the live position 5 s after every "off" click.
  const hourRef = useRef(getCurrentHour());
  useEffect(() => {
    if (!enabled) return; // Live mode OFF → stop pushing updates.
    const tick = () => {
      const hour = getCurrentHour();
      hourRef.current = hour;
      const date = dateAtHour(hour, tz);
      const sun = calcSunPosition(date, config.refLat, config.refLon);
      const lightPos = sunToLightPosition(sun);
      const { isDark } = getSkyState(sun.altitude);
      onSunUpdate(lightPos, isDark);
      // Mirror into the shared time store so the recommendation
      // engine can read a synchronous snapshot.
      useTimeStore.getState().set({ hour, tz, localDate: date, lat: config.refLat });
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [enabled, tz, config.refLat, config.refLon, onSunUpdate, getCurrentHour]);

  // Visible LIVE pill removed per design pass — the sidebar footer's
  // Live mode toggle now owns that state. This component remains
  // mounted purely as a side-effect carrier for the 5-second sun/
  // weather tick wired in the useEffect above. Returning null keeps
  // the host (App.tsx) call site untouched.
  void darkMode; void t;
  return null;
}
