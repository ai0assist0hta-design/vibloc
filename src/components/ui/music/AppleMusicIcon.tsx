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

import { useT } from '../../../lib/app/i18n';
import { openAppleMusic } from '../../../lib/share/openAppleMusic';

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

/** Solid-white beamed double-eighth-note silhouette — same shape
 *  Apple's Music app icon uses (two filled note heads + two stems
 *  joined by a slightly-curved beam). Drawn as a single SVG path so
 *  it scales crisply at every size from 16 px to 256 px. */
function NoteGlyph({ size }: { size: number }) {
  // viewBox 32×32 chosen so the note fills ~70% of the icon — same
  // visual ratio as Apple's actual app icon glyph.
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path
        fill="#fff"
        d="
          M11.5 6.6
          C11.5 5.8 12.0 5.2 12.8 5.0
          L23.6 2.6
          C24.4 2.4 25.0 3.0 25.0 3.8
          L25.0 19.5
          C25.0 21.5 23.5 23.0 21.5 23.0
          C19.5 23.0 18.0 21.5 18.0 19.5
          C18.0 17.5 19.5 16.0 21.5 16.0
          C22.1 16.0 22.6 16.1 23.0 16.4
          L23.0 9.0
          L13.5 11.0
          L13.5 22.5
          C13.5 24.5 12.0 26.0 10.0 26.0
          C8.0 26.0 6.5 24.5 6.5 22.5
          C6.5 20.5 8.0 19.0 10.0 19.0
          C10.6 19.0 11.1 19.1 11.5 19.4
          Z
        "
      />
    </svg>
  );
}

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
        // iOS app-icon squircle approximation. 22% radius reads as
        // the right shape from 16 px up.
        borderRadius: Math.round(size * 0.22),
        border: 'none',
        // Apple's actual gradient — light coral pink at the top
        // graduating to a saturated red at the bottom. Sampled
        // approximately from the iOS 18 Music app icon.
        background: 'linear-gradient(180deg, #FB5C74 0%, #FA243C 100%)',
        color: '#fff',
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.45,
        display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.18)',
        transition: 'transform 100ms ease, opacity 120ms ease',
        padding: 0,
      }}
      onMouseDown={(e) => { if (enabled) e.currentTarget.style.transform = 'scale(0.94)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <NoteGlyph size={Math.round(size * 0.62)} />
    </button>
  );
}
