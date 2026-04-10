/**
 * Weather snapshot store.
 *
 * Single source of truth for the city's current weather. Two consumers:
 *
 *   1. **TimeSlider** — reads `snapshot` to render a small icon next
 *      to the LIVE indicator. UI only, never temperature/wind text.
 *
 *   2. **recommendEngine.cityVibeAlgorithm** — reads `getSnapshot()`
 *      synchronously at recommend time and applies a small mood
 *      bias to the genre weights. The user explicitly does NOT want
 *      this surfaced in the UI — it's a silent system-level nudge.
 *
 * Why a Zustand store and not just a hook
 * ---------------------------------------
 * The recommendation engine is a plain async function, not a React
 * component, so it can't `useWeather()`. Zustand's vanilla `getState`
 * lets the engine read the latest snapshot synchronously without any
 * React context. Components still get re-renders via subscribe.
 */

import { create } from 'zustand';
import {
  fetchCurrentWeather,
  type WeatherSnapshot,
} from '../lib/weather/openMeteo';

type WeatherState = {
  /** Most recent successfully fetched snapshot, or null if never
   *  loaded / last fetch failed / area without coords. */
  snapshot: WeatherSnapshot | null;
  /** Background fetch in progress flag. UI may use this to render a
   *  subtle pulse but should not block on it. */
  loading: boolean;
  /** Coordinate of the most recent fetch. Used to dedupe redundant
   *  loads when the user toggles areas back and forth. */
  lastCoord: { lat: number; lon: number } | null;
  /** Fetch the current weather for the given lat/lon and update the
   *  snapshot. Idempotent — repeated calls within the cache TTL hit
   *  the sessionStorage cache, not the network. */
  loadFor: (lat: number, lon: number) => Promise<void>;
  /** Clear the current snapshot — used when the user disables LIVE
   *  mode so the icon disappears immediately. */
  clear: () => void;
};

export const useWeatherStore = create<WeatherState>((set, get) => ({
  snapshot: null,
  loading: false,
  lastCoord: null,
  loadFor: async (lat, lon) => {
    // Skip if we already have a fresh snapshot for the same coord —
    // openMeteo's own cache will return it anyway, but skipping the
    // round-trip avoids the brief loading flicker.
    const { lastCoord, snapshot } = get();
    if (
      lastCoord &&
      Math.abs(lastCoord.lat - lat) < 0.05 &&
      Math.abs(lastCoord.lon - lon) < 0.05 &&
      snapshot &&
      Date.now() - snapshot.fetchedAt < 10 * 60 * 1000
    ) {
      return;
    }
    set({ loading: true });
    const snap = await fetchCurrentWeather(lat, lon);
    set({
      snapshot: snap,
      loading: false,
      lastCoord: snap ? { lat, lon } : get().lastCoord,
    });
  },
  clear: () => set({ snapshot: null, lastCoord: null }),
}));

/**
 * Plain (non-React) accessor for modules that aren't components.
 * Used by the recommendation engine to peek at the latest snapshot
 * without taking a React dependency.
 */
export function getCurrentWeatherSnapshot(): WeatherSnapshot | null {
  return useWeatherStore.getState().snapshot;
}
