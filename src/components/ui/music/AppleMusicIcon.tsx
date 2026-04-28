/**
 * Compact Apple Music affordance.
 *
 * Replaces the wider "Apple Music" pill that used to live on track
 * rows + the now-playing bar with a small square icon button styled
 * after the actual Apple Music app icon (red rounded square + white
 * music note). Same click behavior, ⅓ the visual weight, no text.
 *
 * Single source of truth so every Apple Music CTA across VIBLOC
 * stays visually identical.
 */

import { Music2 } from 'lucide-react';
import { useT } from '../../../lib/app/i18n';
import { openAppleMusic } from '../../../lib/share/openAppleMusic';
import { APPLE_RED } from '../../../lib/ui/tokens';

type Props = {
  /** music.apple.com URL. When missing the button renders disabled. */
  href?: string | null;
  /** Side length in px. Defaults to 22. Track-row use ≈ 22, the
   *  now-playing bar uses 24 to match its 32 px play button. */
  size?: number;
  /** stop click bubbling to the parent row's onClick (used in
   *  TrackRow where the row itself is also clickable to play). */
  stopPropagation?: boolean;
};

export function AppleMusicIcon({ href, size = 22, stopPropagation = true }: Props) {
  const t = useT();
  const enabled = !!href;
  return (
    <button
      type="button"
      aria-label={t('player.openAppleMusic')}
      title={t('player.openAppleMusic')}
      disabled={!enabled}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        if (href) openAppleMusic(href);
      }}
      style={{
        flexShrink: 0,
        width: size, height: size,
        // Apple Music icon corner radius is ~22% of side. iOS 7+
        // app-icon math (squircle approximation good enough at this
        // size — pure border-radius reads close to the real glyph).
        borderRadius: Math.round(size * 0.22),
        border: 'none',
        background: APPLE_RED,
        color: '#fff',
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.45,
        display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.20)',
        transition: 'transform 100ms ease, opacity 120ms ease',
        padding: 0,
      }}
      onMouseDown={(e) => { if (enabled) e.currentTarget.style.transform = 'scale(0.94)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <Music2 size={Math.round(size * 0.55)} strokeWidth={2.4} fill="currentColor" />
    </button>
  );
}
