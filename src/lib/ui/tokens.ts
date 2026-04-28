/**
 * Design tokens — shared constants for VIBLOC's music surfaces.
 *
 * These are the only place colors / radii / typography settings
 * are spelled out. Components import from here so the visual
 * vocabulary stays in sync across the panels, the share preview
 * page, the modals, and any future surface.
 *
 * Derived from research notes (uiux-research-2026.md) + Apple
 * Music's web layout. Numbers chosen so:
 *
 *   - Radius scale is a 4-step series (S=6, M=10, L=14, XL=20),
 *     plus `pill` (999) for action buttons. Anything outside the
 *     scale is a smell — pick the nearest step.
 *   - Typography uses two families: headlines / titles in Inter
 *     (system-ui fallback), labels / monospace details in IBM Plex
 *     Mono. Prevents a third font from sneaking in.
 *   - Apple-inspired ink (#1a1a2e) + paper (#faf9f6) + Apple Music
 *     red accent live here as named constants — no more triplicate
 *     `const APPLE_RED = '#FA243C'` in every file.
 */

// ─── Color ───────────────────────────────────────────────────────────

/** Apple Music's brand red. Used only for high-attention CTAs that
 *  navigate INTO Apple Music (track row "Open in Apple Music" pill,
 *  Featured-hero share, detail-view Play button). Never for VIBLOC-
 *  internal actions — those use INK. */
export const APPLE_RED = '#FA243C';

/** Primary text + dominant CTA fill in light theme. The single
 *  "VIBLOC dark" most surfaces resolve to. */
export const INK = '#1a1a2e';

/** Light-theme paper (panel background, modal backdrop). */
export const PAPER = '#faf9f6';

/** Muted secondary text (curator subtitles, time stamps, etc.). */
export const MUTED = '#6e6e73';

/** Hairline 1 px divider — semi-transparent ink so it reads on
 *  any backdrop (light panel, image hover, etc.). */
export const DIVIDER = 'rgba(26,26,46,0.10)';

/** Hover background for interactive rows / cards. Same alpha as
 *  Apple Music's track rows on macOS for visual continuity. */
export const HOVER_BG = 'rgba(26,26,46,0.05)';

// ─── Radius ──────────────────────────────────────────────────────────

export const RADIUS = {
  /** Tiny chips, track-row artwork. */
  s:  6,
  /** Default card / button corner. */
  m:  10,
  /** Larger cards, modal sections. */
  l:  14,
  /** Top-level panels, modal bodies. */
  xl: 20,
  /** Action pills + circular avatars. */
  pill: 999,
  /** Half (= circle). */
  full: '50%' as const,
};

// ─── Typography ──────────────────────────────────────────────────────

/** UI fonts. Inter for prose / titles; IBM Plex Mono for labels,
 *  technical metadata, eyebrow text. */
export const FONT = {
  ui:   "'Inter', 'Pretendard', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
};

/** Eyebrow / section header label — uppercase IBM Plex Mono. */
export const EYEBROW = {
  fontFamily: FONT.mono,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
};

/** Panel-level header (PLACE / MUSIC dot+label). Same on both
 *  floating panels so they read as a paired design system. */
export const PANEL_HEADER = {
  fontFamily: FONT.mono,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1.5,
  textTransform: 'uppercase' as const,
};

/** Section header within a panel (TENANTS / TOP PLAYLISTS / TOP
 *  PICKS / MY PLAYLIST / AI 추천 …). One spec, applied everywhere
 *  so the visual rhythm of the two panels matches row-for-row. */
export const SECTION_HEADER = {
  fontFamily: FONT.mono,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: 'uppercase' as const,
};

/** Floating-panel inner padding. Both leftPanel and rightPanel use
 *  this so their content columns line up edge-to-edge. */
export const PANEL_PADDING = '14px 18px 18px';
