/**
 * First-run ghost tooltip tour for the 3D canvas.
 *
 * Pattern source: Figma's animated onboarding (Appcues GoodUX writeup,
 * 2024) and Spline's minimal first-run surface. Three auto-advancing
 * tooltips teach the three core canvas gestures — drag-to-orbit,
 * scroll-to-zoom, click-a-building — then dismiss for good. The
 * "Got it" button explicitly opts out so the tour never re-shows.
 *
 * Persistence: localStorage flag `vibloc_tour_seen_v1`. Bumping the
 * version key resets the tour for everyone (e.g. when we add a new
 * gesture worth teaching).
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'vibloc_tour_seen_v1';

type Step = {
  icon: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: '01',
    title: 'Drag to orbit',
    body: 'Click and drag anywhere to rotate the city.',
  },
  {
    icon: '02',
    title: 'Scroll to zoom',
    body: 'Use the scroll wheel or pinch to get closer.',
  },
  {
    icon: '03',
    title: 'Click a building',
    body: 'Tag music, see the local vibe, open Street View.',
  },
];

type Props = { darkMode: boolean };

export function CanvasTour({ darkMode }: Props) {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Wait a beat so the canvas paints first.
        const t = setTimeout(() => setShow(true), 900);
        return () => clearTimeout(t);
      }
    } catch {
      /* localStorage may be blocked — show the tour anyway. */
      setShow(true);
    }
  }, []);

  // Auto-advance every 3.5s; final step waits for the dismiss click.
  useEffect(() => {
    if (!show) return;
    if (step >= STEPS.length - 1) return;
    const t = setTimeout(() => setStep((s) => s + 1), 3500);
    return () => clearTimeout(t);
  }, [show, step]);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
    setShow(false);
  };

  if (!show) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-label="Canvas tour"
      style={{
        position: 'fixed',
        bottom: 96,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        padding: '14px 18px',
        borderRadius: 16,
        background: darkMode ? 'rgba(20,20,28,0.92)' : 'rgba(255,255,255,0.94)',
        border: darkMode ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.10)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        boxShadow: darkMode
          ? '0 12px 40px rgba(0,0,0,0.55)'
          : '0 12px 40px rgba(15,23,42,0.18)',
        fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
        color: darkMode ? '#f5f5f7' : '#0e0e1a',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        maxWidth: 380,
        animation: 'vibloc-tour-fade 320ms ease',
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">{s.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, marginBottom: 2 }}>
          {s.title}
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.78, lineHeight: 1.4 }}>
          {s.body}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: i === step
                  ? (darkMode ? '#f5f5f7' : '#0e0e1a')
                  : (darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'),
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={isLast ? dismiss : () => setStep((s) => s + 1)}
          style={{
            padding: '6px 12px',
            borderRadius: 10,
            border: 'none',
            background: darkMode ? '#f5f5f7' : '#0e0e1a',
            color: darkMode ? '#0a0a0f' : '#fff',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {isLast ? 'Got it' : 'Next'}
        </button>
      </div>
    </div>
  );
}
