/**
 * City-local time snapshot store.
 *
 * TimeSlider is the single writer: whenever the user scrubs the
 * slider (or the live clock ticks) it pushes the current city-local
 * hour + timezone + IANA date into this store. The recommendation
 * engine reads this snapshot synchronously at recommend time and
 * applies a silent mood bias (see `applyTimeOfDayBias` /
 * `applySeasonBias` in `recommendEngine.ts`).
 *
 * Like the weather bias, this is INTENTIONALLY not surfaced in the
 * UI. We don't want labels like "late-night jazz" on the panel —
 * just a subtle shift in the playlist's center of gravity so the
 * music matches the moment without anyone calling it out.
 *
 * Why a Zustand store and not a hook: same reason as
 * `useWeatherStore` — the recommendation engine is a plain async
 * function and can't use React hooks.
 */

import { create } from 'zustand';

export type TimeSnapshot = {
  /** City-local hour, 0–24 (may be fractional: 14.5 = 14:30). */
  hour: number;
  /** IANA timezone name (e.g. "Asia/Tokyo"). */
  tz: string;
  /** City-local Date the slider currently represents. Used to
   *  derive season bias (month) independent of UTC. */
  localDate: Date;
  /** City's approximate latitude, for hemisphere-aware season calc. */
  lat: number;
};

type TimeState = {
  snapshot: TimeSnapshot | null;
  set: (snap: TimeSnapshot) => void;
  clear: () => void;
};

export const useTimeStore = create<TimeState>((set) => ({
  snapshot: null,
  set: (snap) => set({ snapshot: snap }),
  clear: () => set({ snapshot: null }),
}));

/** Non-React accessor for the recommendation engine. */
export function getCurrentTimeSnapshot(): TimeSnapshot | null {
  return useTimeStore.getState().snapshot;
}
