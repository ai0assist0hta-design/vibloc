import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CITY_TIMEZONES,
  calcSunPosition,
  dateAtHour,
  sunToLightPosition,
  formatHour,
  getSkyState,
  getCityLocalTime,
  type SunPosition,
} from '../../lib/scene/sunPosition';
import { CITY_AREAS, type CityAreaKey } from '../../lib/geo/osmLoader';
import { useWeatherStore } from '../../stores/useWeatherStore';
import { useTimeStore } from '../../stores/useTimeStore';
import { weatherEmoji, weatherLabel } from '../../lib/weather/openMeteo';

type TimeSliderProps = {
  area: CityAreaKey;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onSunUpdate: (lightPos: [number, number, number], isDark: boolean) => void;
  darkMode: boolean;
};

export function TimeSlider({ area, enabled, onToggle, onSunUpdate, darkMode }: TimeSliderProps) {
  const tz = CITY_TIMEZONES[area] || 'UTC';
  const config = CITY_AREAS[area];

  // Get current local hour in that city
  const getCurrentHour = useCallback(() => {
    const local = getCityLocalTime(tz);
    return local.getHours() + local.getMinutes() / 60;
  }, [tz]);

  const [hour, setHour] = useState(getCurrentHour);
  const [isLive, setIsLive] = useState(true); // auto-follow real time
  const liveRef = useRef(true);
  const prevAreaRef = useRef(area);

  // Reset to live time when area changes
  useEffect(() => {
    if (prevAreaRef.current !== area) {
      prevAreaRef.current = area;
      setIsLive(true);
      liveRef.current = true;
      setHour(getCurrentHour());
    }
  }, [area, getCurrentHour]);

  // Live clock tick (every 30s)
  useEffect(() => {
    if (!enabled) return;
    if (!isLive) return;
    const tick = () => {
      if (liveRef.current) setHour(getCurrentHour());
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [enabled, isLive, getCurrentHour]);

  // Calculate and push sun position
  useEffect(() => {
    if (!enabled) return;
    const date = dateAtHour(hour, tz);
    const sun = calcSunPosition(date, config.refLat, config.refLon);
    const lightPos = sunToLightPosition(sun);
    const { isDark } = getSkyState(sun.altitude);
    onSunUpdate(lightPos, isDark);
  }, [enabled, hour, area, tz, config.refLat, config.refLon, onSunUpdate]);

  // Mirror the current slider time into the shared time store so the
  // recommendation engine can read a synchronous snapshot without a
  // React dependency (same pattern as useWeatherStore). Silent — the
  // engine uses it for a tiny mood bias; the UI never labels it.
  useEffect(() => {
    const date = dateAtHour(hour, tz);
    useTimeStore.getState().set({
      hour,
      tz,
      localDate: date,
      lat: config.refLat,
    });
  }, [hour, tz, config.refLat]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setHour(v);
    setIsLive(false);
    liveRef.current = false;
  };

  const handleLiveClick = () => {
    setIsLive(true);
    liveRef.current = true;
    setHour(getCurrentHour());
  };

  // Sun info for display
  const date = dateAtHour(hour, tz);
  const sun = calcSunPosition(date, config.refLat, config.refLon);
  const { isDark } = getSkyState(sun.altitude);

  // Sun/moon icon based on altitude
  const timeIcon = sun.altitude > 0 ? (sun.altitude > 10 ? '\u2600' : '\uD83C\uDF05') : '\uD83C\uDF19';

  const bg = darkMode
    ? 'rgba(255,255,255,0.06)'
    : 'rgba(255,255,255,0.7)';
  const border = darkMode
    ? '1px solid rgba(255,255,255,0.12)'
    : '1px solid rgba(0,0,0,0.1)';
  const text = darkMode ? '#e0e0e8' : '#1a1a2e';
  const subText = darkMode ? '#888' : '#999';

  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        zIndex: 20,
        transition: 'all 0.4s ease',
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => onToggle(!enabled)}
        style={{
          padding: '8px 12px',
          borderRadius: 12,
          border: enabled
            ? (darkMode ? '2px solid #e0e0e8' : '2px solid #1a1a2e')
            : border,
          background: enabled
            ? (darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(26,26,46,0.08)')
            : bg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          fontWeight: enabled ? 700 : 400,
          color: text,
          cursor: 'pointer',
          boxShadow: darkMode
            ? '0 4px 16px rgba(0,0,0,0.3)'
            : '0 4px 16px rgba(0,0,0,0.06)',
          transition: 'all 0.4s ease',
          whiteSpace: 'nowrap',
        }}
        title="Real-Time Mode"
      >
        {'\u23F0'} REAL-TIME
      </button>

      {/* Slider panel — only visible when enabled */}
      {enabled && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 16px',
            borderRadius: 14,
            background: bg,
            border,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: darkMode
              ? '0 4px 16px rgba(0,0,0,0.3)'
              : '0 4px 16px rgba(0,0,0,0.06)',
            transition: 'all 0.4s ease',
          }}
        >
          {/* Time icon */}
          <span style={{ fontSize: 16, lineHeight: 1 }}>{timeIcon}</span>

          {/* Time display */}
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 14,
              fontWeight: 700,
              color: text,
              minWidth: 44,
              textAlign: 'center',
            }}
          >
            {formatHour(hour)}
          </span>

          {/* Slider */}
          <input
            type="range"
            min={0}
            max={23.99}
            step={0.05}
            value={hour}
            onChange={handleSliderChange}
            style={{
              width: 160,
              height: 4,
              appearance: 'none',
              WebkitAppearance: 'none',
              background: `linear-gradient(to right,
                #1a1a3e 0%, #1a1a3e 20%,
                #e8a040 25%, #f8d060 30%,
                #87CEEB 35%, #87CEEB 70%,
                #e8a040 75%, #f8d060 78%,
                #1a1a3e 83%, #1a1a3e 100%
              )`,
              borderRadius: 2,
              outline: 'none',
              cursor: 'pointer',
            }}
          />

          {/* Altitude info */}
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9,
              color: subText,
              minWidth: 36,
            }}
          >
            {sun.altitude > 0 ? `${Math.round(sun.altitude)}\u00B0` : 'night'}
          </span>

          {/* Live sync button */}
          {!isLive && (
            <button
              onClick={handleLiveClick}
              style={{
                padding: '3px 8px',
                borderRadius: 8,
                border: darkMode
                  ? '1px solid rgba(255,255,255,0.2)'
                  : '1px solid rgba(0,0,0,0.15)',
                background: darkMode
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.05)',
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9,
                fontWeight: 600,
                color: text,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              NOW
            </button>
          )}

          {isLive && (
            <span
              title={`Real-time · synced ${formatHour(hour)} ${tz}`}
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9,
                fontWeight: 700,
                color: '#4CAF50',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                letterSpacing: 0.4,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#4CAF50',
                  boxShadow: '0 0 6px rgba(76,175,80,0.7)',
                }}
              />
              REAL-TIME
            </span>
          )}

          {/* Live weather glyph — only present in LIVE mode and only
              once Open-Meteo has answered. Pure icon, no temperature
              text, per the explicit "icon only, no graphic chrome"
              brief. The same store that backs this glyph is read by
              the recommendation engine for silent mood biasing. */}
          <WeatherGlyph />
        </div>
      )}
    </div>
  );
}

function WeatherGlyph() {
  const snap = useWeatherStore((s) => s.snapshot);
  if (!snap) return null;
  return (
    <span
      title={weatherLabel(snap)}
      style={{
        fontSize: 14,
        lineHeight: 1,
        marginLeft: 2,
      }}
    >
      {weatherEmoji(snap)}
    </span>
  );
}
