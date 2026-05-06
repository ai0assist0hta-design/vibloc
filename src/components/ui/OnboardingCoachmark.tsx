/**
 * First-visit onboarding coachmark — 3-step modal explaining what
 * VIBLOC is and how to use it. Surfaces ONLY when:
 *   - the user lands on /map for the first time, AND
 *   - localStorage flag `vibloc.onboarded` is not set.
 *
 * After completion (or skip) the flag is written and this never
 * renders again. No analytics dependency, no backend call.
 *
 * Why a modal vs inline coachmarks: real DOM coachmarks would have
 * to anchor to specific elements (3D building, search bar, NowPlaying
 * bar) and re-position on resize / camera move. A centered modal is
 * cheaper and the screenshots in each step communicate the anchor
 * intent without literal arrows.
 */

import { useEffect, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { useT } from '../../lib/app/i18n';

const STORAGE_KEY = 'vibloc.onboarded';

// Module-level style injection — was previously an inline <style>
// inside the dialog, which polluted the dialog's textContent (and
// therefore screen-reader announcements) with the entire CSS source.
// One-shot append to <head> keeps the keyframes accessible to the
// dialog while leaving the a11y tree clean.
if (typeof document !== 'undefined' && !document.getElementById('vbk-onboard-styles')) {
  const s = document.createElement('style');
  s.id = 'vbk-onboard-styles';
  s.textContent = `
    @keyframes vbk-fade-in { from { opacity: 0 } to { opacity: 1 } }
    @keyframes vbk-slide-up { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
  `;
  document.head.appendChild(s);
}

function hasOnboarded(): boolean {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(STORAGE_KEY) === '1'; }
  catch { return true; }
}
function markOnboarded(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, '1'); } catch { /* private mode */ }
}

type Props = {
  darkMode?: boolean;
};

export function OnboardingCoachmark({ darkMode = false }: Props) {
  const t = useT();
  const [visible, setVisible] = useState<boolean>(() => !hasOnboarded());
  const [step, setStep] = useState(0);

  // Esc to dismiss
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible]);

  function dismiss() {
    markOnboarded();
    setVisible(false);
  }

  if (!visible) return null;

  const ink = darkMode ? '#f5f5f7' : '#0e0e1a';
  const muted = darkMode ? 'rgba(245,245,247,0.66)' : 'rgba(14,14,26,0.62)';
  const cardBg = darkMode ? 'rgba(28,28,30,0.96)' : 'rgba(255,255,255,0.96)';
  const cardBorder = darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const ctaBg = darkMode ? '#f5f5f7' : '#0e0e1a';
  const ctaInk = darkMode ? '#0a0a0f' : '#ffffff';

  const steps = [
    { title: t('onboard.step1.title'), body: t('onboard.step1.body') },
    { title: t('onboard.step2.title'), body: t('onboard.step2.body') },
    { title: t('onboard.step3.title'), body: t('onboard.step3.body') },
  ];
  const isLast = step === steps.length - 1;
  const current = steps[step];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboard-title"
      style={{
        position: 'fixed', inset: 0,
        background: darkMode ? 'rgba(0,0,0,0.65)' : 'rgba(14,14,26,0.45)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200,
        padding: 20,
        animation: 'vbk-fade-in 240ms ease-out both',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: 460,
        padding: '32px 28px 24px',
        borderRadius: 20,
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        boxShadow: '0 24px 64px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.16)',
        color: ink,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Pretendard Variable", system-ui, sans-serif',
        animation: 'vbk-slide-up 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
      }}>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('onboard.skip')}
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 28, height: 28, borderRadius: '50%',
            border: 'none', background: 'transparent',
            color: muted, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={16} strokeWidth={2.2} />
        </button>

        {/* Step indicator dots */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 6,
          marginBottom: 20,
        }}>
          {steps.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              style={{
                width: i === step ? 18 : 6, height: 6, borderRadius: 999,
                background: i === step ? ink : muted,
                opacity: i === step ? 1 : 0.4,
                transition: 'width 240ms ease, opacity 240ms ease',
              }}
            />
          ))}
        </div>

        <div
          key={step}
          style={{ animation: 'vbk-slide-up 280ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
        >
          <div
            id="onboard-title"
            style={{
              fontSize: 22, fontWeight: 700, letterSpacing: '-0.014em',
              lineHeight: 1.2, marginBottom: 10, textAlign: 'center',
            }}
          >
            {current.title}
          </div>
          <div style={{
            fontSize: 14, fontWeight: 400,
            letterSpacing: '-0.01em', lineHeight: 1.5,
            color: muted, textAlign: 'center',
            maxWidth: 360, marginLeft: 'auto', marginRight: 'auto',
          }}>
            {current.body}
          </div>
        </div>

        <div style={{
          marginTop: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}>
          <button
            type="button"
            onClick={dismiss}
            style={{
              padding: '8px 14px',
              borderRadius: 999, border: 'none',
              background: 'transparent', color: muted,
              fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('onboard.skip')}
          </button>
          <button
            type="button"
            onClick={() => isLast ? dismiss() : setStep((s) => s + 1)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '10px 20px',
              borderRadius: 999, border: 'none',
              background: ctaBg, color: ctaInk,
              fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'transform 160ms ease, opacity 160ms ease',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {isLast ? t('onboard.start') : t('onboard.next')}
            {!isLast && <ChevronRight size={16} strokeWidth={2.4} />}
          </button>
        </div>
      </div>
    </div>
  );
}
