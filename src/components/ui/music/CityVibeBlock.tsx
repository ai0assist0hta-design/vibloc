/**
 * City Vibe block — read-only summary of "what does this city sound
 * like". Shows the city name + the top 4 GenreKey labels (the engine
 * scores against all 6, but only the dominant 4 are displayed so the
 * chip row stays on a single line and the panel header doesn't grow
 * vertically). Color-tinted with the existing `GENRE_COLORS` palette
 * so the section blends into the panel without introducing any new
 * colors.
 *
 * No fetches happen here — the parent passes the resolved CityVibe
 * (already cached) so the block paints on first render with no
 * loading state.
 */

import type { CityVibe } from '../../../lib/music/trackTypes';
import { GENRE_COLORS } from '../../../data/genres';
import { getFamily } from '../../../lib/music/genreFamily';
import { useT } from '../../../lib/app/i18n';
import { contrastColor } from '../../../lib/ui/contrastColor';

type Props = {
  vibe: CityVibe;
  /** Foreground text color from the parent panel's design tokens. */
  text: string;
  /** Secondary text color (used for the section eyebrow). */
  text2?: string;
  /** Tertiary (label) text color from the parent. */
  text3: string;
  /** 1px divider color from the parent. */
  divider: string;
  darkMode?: boolean;
};

export function CityVibeBlock({
  vibe, text, text2, text3, divider, darkMode = false,
}: Props) {
  const mode = darkMode ? 'dark' : 'light';
  // Section eyebrow color — prefer text2 (better contrast than the
  // tertiary text3), fall back to text3 when caller hasn't passed it.
  const eyebrow = text2 ?? text3;
  const t = useT();
  return (
    <div
      style={{
        marginTop: 4,
        paddingTop: 12,
        borderTop: `1px solid ${divider}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: 1.0,
          textTransform: 'uppercase',
          color: eyebrow,
          fontFamily: "'IBM Plex Mono', monospace",
          marginBottom: 4,
        }}
      >
        {t('music.cityVibe')}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: text,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {vibe.city}
        </span>
        <span style={{ fontSize: 11, color: text3 }}>·</span>
        {vibe.topGenres.slice(0, 4).map((g) => {
          // 7-family collapse + glyph (UI/UX research #6): the chip
          // is colored by genre FAMILY (not literal genre) so the
          // four chips never collide visually, and a leading glyph
          // adds a non-color cue per WCAG 1.4.1.
          const fam = getFamily(g);
          const short = GENRE_COLORS[g].label.split('/')[0].trim();
          return (
            <span
              key={g}
              title={`${short} · ${fam.label}`}
              style={{
                padding: '3px 9px',
                borderRadius: 999,
                background: fam.color + '22',
                color: contrastColor(fam.color, mode),
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                border: `1px solid ${fam.color}44`,
                fontFamily: "'IBM Plex Mono', monospace",
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 9 }}>{fam.glyph}</span>
              {short}
            </span>
          );
        })}
      </div>
    </div>
  );
}
