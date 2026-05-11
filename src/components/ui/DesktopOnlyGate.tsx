/**
 * Desktop-only gate.
 *
 * VIBLOC is intentionally a desktop / large-tablet experience —
 * the 3D city, two floating side panels, NowPlayingBar, and the
 * full-screen map controls don't collapse cleanly into a phone
 * viewport, and we don't ship a mobile build. Rather than serving
 * a broken layout, viewports under the breakpoint get a friendly
 * splash that explains the situation in the user's language.
 *
 * Breakpoint: 1024 px width — Apple's "regular width" trait
 * threshold for iPad-class devices and the smallest size at which
 * VIBLOC's two-column panel layout fits without truncation.
 *
 * The gate is tri-lingual via useT() and intentionally has zero
 * Three.js dependency so it loads on the marketing-entry chunk
 * (~87 KB gz) — phone users never download the 1 MB three.js
 * vendor split.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '../../lib/app/i18n';
import { FONT, INK, PAPER, MUTED } from '../../lib/ui/tokens';

const MIN_DESKTOP_WIDTH = 1024;

function useIsDesktop(): boolean {
  // Optimistic SSR-friendly default: assume desktop until measured.
  // First effect tick corrects on the client. This avoids a flash
  // of the gate on full-width loads.
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined'
      ? true
      : window.innerWidth >= MIN_DESKTOP_WIDTH,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function check() {
      setIsDesktop(window.innerWidth >= MIN_DESKTOP_WIDTH);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isDesktop;
}

export function DesktopOnlyGate({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  const t = useT();

  if (isDesktop) return <>{children}</>;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: PAPER, color: INK,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 32, gap: 18, textAlign: 'center',
        fontFamily: FONT.ui,
      }}
    >
      {/* Eyebrow */}
      <div style={{
        fontFamily: FONT.mono,
        fontSize: 11, fontWeight: 800, letterSpacing: 1.6,
        textTransform: 'uppercase', color: MUTED,
      }}>
        VIBLOC
      </div>

      {/* Headline — `keep-all` prevents Korean from splitting at the
          last syllable + period (orphan "요." on its own line was
          ugly with maxWidth 320). Slightly wider cap (360) gives
          English ("VIBLOC is a desktop experience.") a single line
          on common viewports. */}
      <h1 style={{
        margin: 0, fontSize: 22, fontWeight: 800,
        lineHeight: 1.35, letterSpacing: -0.3,
        maxWidth: 360,
        wordBreak: 'keep-all',
      }}>
        {t('gate.headline')}
      </h1>

      {/* Body — explanation */}
      <p style={{
        margin: 0, fontSize: 14, lineHeight: 1.6,
        color: MUTED, maxWidth: 360,
        wordBreak: 'keep-all',
      }}>
        {t('gate.body')}
      </p>

      {/* Hint chip — UI font (not mono) for KO/JA fluency; mono +
          letter-spacing was inserting visual double-spaces between
          한글 어절. Numeric "1280px" stays in tabular-nums via the
          inherited Inter feature setting. */}
      <div style={{
        marginTop: 8,
        padding: '8px 14px',
        borderRadius: 10,
        border: '1px dashed rgba(14,14,26,0.20)',
        fontFamily: FONT.ui,
        fontSize: 12, color: MUTED,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {t('gate.hint')}
      </div>
    </div>
  );
}
