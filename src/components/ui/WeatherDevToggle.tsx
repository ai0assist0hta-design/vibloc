/**
 * WeatherDevToggle — temporary cycle button to preview rain / snow /
 * thunder visuals without waiting for real weather to change.
 *
 * Cycles: off → rain (light) → rain (heavy) → thunder → snow → off
 * Each press writes a synthetic WeatherSnapshot into the weather
 * store, which WeatherFX picks up. Pressing back to "off" clears the
 * store so live weather (if enabled) takes over again.
 *
 * Apple chip spec — same vocabulary as the REAL-TIME pill in
 * TimeSlider: 980 radius, 11/600/0.06em uppercase, glass surface.
 */

import { useState } from 'react';
import { useWeatherStore } from '../../stores/useWeatherStore';
import { useDarkMode } from '../../lib/app/useDarkMode';

type Step = {
  label: string;
  category: 'rain' | 'thunder' | 'snow' | null;
  precipitationMm: number;
  windy: boolean;
  code: number;
};

const STEPS: Step[] = [
  { label: 'OFF',       category: null,      precipitationMm: 0,  windy: false, code: 0 },
  { label: 'DRIZZLE',   category: 'rain',    precipitationMm: 0.5, windy: false, code: 51 },
  { label: 'HEAVY RAIN', category: 'rain',   precipitationMm: 12, windy: true,  code: 65 },
  { label: 'THUNDER',   category: 'thunder', precipitationMm: 18, windy: true,  code: 95 },
  { label: 'SNOW',      category: 'snow',    precipitationMm: 1.5, windy: false, code: 73 },
];

export function WeatherDevToggle() {
  const dark = useDarkMode();
  const [stepIdx, setStepIdx] = useState(0);

  function next() {
    const ni = (stepIdx + 1) % STEPS.length;
    setStepIdx(ni);
    const s = STEPS[ni];
    if (s.category === null) {
      useWeatherStore.getState().clear();
    } else {
      useWeatherStore.setState({
        snapshot: {
          category: s.category,
          windy: s.windy,
          tempC: 12,
          code: s.code,
          windKmh: s.windy ? 35 : 6,
          precipitationMm: s.precipitationMm,
          fetchedAt: Date.now(),
        },
        lastCoord: { lat: 35, lon: 139 },
      });
    }
  }

  const cur = STEPS[stepIdx];
  const active = cur.category !== null;

  return (
    <button
      type="button"
      onClick={next}
      title="Cycle weather preview (dev)"
      style={{
        position: 'fixed',
        right: 296, // sit left of the right sidebar (FixedQueueSidebar 280 + 16 gutter)
        bottom: 24,
        zIndex: 25,
        padding: '6px 14px',
        borderRadius: 980,
        border: `1px solid ${active
          ? (dark ? 'rgba(255,255,255,0.20)' : 'rgba(14,14,26,0.18)')
          : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)')}`,
        background: active
          ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(14,14,26,0.10)')
          : (dark ? 'rgba(28,28,30,0.55)' : 'rgba(255,255,255,0.55)'),
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: dark ? '#e0e0e8' : '#0e0e1a',
        cursor: 'pointer',
        transition: 'background 120ms ease, border-color 120ms ease',
        whiteSpace: 'nowrap',
      }}
    >
      {`Rain · ${cur.label}`}
    </button>
  );
}
