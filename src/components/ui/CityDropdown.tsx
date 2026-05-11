/**
 * Single-pill city selector.
 *
 * Replaces the 6-chip horizontal row with one button that shows the
 * current city + chevron, opening a vertical list on click. Saves
 * ~80% of the bottom thumb-zone for other chrome (NowPlayingBar,
 * Compass, CanvasTour) without losing any switching power.
 *
 * Design notes:
 *   - Hick's Law: one visible choice with the rest behind a tap.
 *   - Fitts's Law: the pill stays in the bottom-left corner so it
 *     remains a large fixed target (corners have effectively
 *     infinite reach radius on a mouse).
 *   - The menu opens UPWARD from the pill — there's no room below.
 *   - Outside-click + ESC dismisses; current selection is checked.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { CITY_AREAS, type CityAreaKey } from '../../lib/geo/osmLoader';

type Props = {
  area: CityAreaKey;
  onSelect: (key: CityAreaKey) => void;
  darkMode: boolean;
  t: (key: string) => string;
};

export function CityDropdown({ area, onSelect, darkMode, t }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + ESC close
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const ink = darkMode ? '#e0e0e8' : '#0e0e1a';
  const surface = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)';
  const border  = darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.10)';
  const hover   = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 12px',
          borderRadius: 12,
          border,
          background: surface,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
          fontSize: 11, fontWeight: 700,
          color: ink,
          cursor: 'pointer',
          boxShadow: darkMode ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.06)',
          transition: 'background 150ms ease',
        }}
      >
        <span>{t(`city.${area}`)}</span>
        <ChevronDown
          size={12}
          strokeWidth={2.4}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 180ms ease',
          }}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Choose city"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)', left: 0,
            margin: 0, padding: 6,
            listStyle: 'none',
            minWidth: 160,
            background: darkMode ? 'rgba(15,15,20,0.86)' : 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border,
            borderRadius: 12,
            boxShadow: '0 12px 36px rgba(0,0,0,0.20)',
            display: 'flex', flexDirection: 'column', gap: 2,
            zIndex: 50,
          }}
        >
          {(Object.keys(CITY_AREAS) as CityAreaKey[]).map((key) => {
            const selected = key === area;
            return (
              <li key={key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { onSelect(key); setOpen(false); }}
                  style={{
                    width: '100%',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 8,
                    border: 'none', background: 'transparent',
                    color: ink,
                    fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
                    fontSize: 12, fontWeight: selected ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 120ms ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    width: 14, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: selected ? ink : 'transparent',
                  }}>
                    <Check size={12} strokeWidth={2.6} />
                  </span>
                  <span style={{ flex: 1 }}>{t(`city.${key}`)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
