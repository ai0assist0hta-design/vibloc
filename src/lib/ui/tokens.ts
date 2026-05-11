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

// ─── Color palette ───────────────────────────────────────────────────
//
// Single source of truth for every color value used in the app. Inline
// `rgba(...)` / `#hex` literals scattered across components are bugs:
// pick a token from this palette instead. The palette is grouped by
// semantic role so a contributor reaching for "muted text" doesn't
// have to remember whether it's `#5a5a66` or `text3`.
//
// Naming convention:
//   ink* / paper*  = text + canvas in the light theme
//   onDark*        = text colors over dark surfaces
//   hover / accent / tint = ink-with-alpha overlays for surfaces
//   divider*       = 1 px hairline borders
//   overlay*       = full-color dim layers (image overlays, scrims)
//   shadow*        = pre-baked box-shadow strings
//   dark*          = white-with-alpha equivalents for dark theme
//   brand*, accent*  = chromatic exceptions (Apple red / heart / live)
//
// Anything not in this palette is a smell. Add a new token here or
// argue why the inline value is genuinely one-off.

export const COLOR = {
  /* ── Light theme: text ─────────────────────────────────────── */
  /** Primary text + dominant CTA fill. */
  ink:        '#0e0e1a',
  /** Secondary text — slightly softer than ink, still high contrast. */
  ink2:       '#2e2e38',
  /** Tertiary text — captions, metadata, "@alias", count badges. */
  ink3:       '#5a5a66',
  /** Quaternary text — last-resort dim for visited / disabled. */
  ink4:       '#7a7a86',

  /* ── Light theme: surface ──────────────────────────────────── */
  /** Page paper (cream). */
  paper:      '#faf9f6',
  /** Pure white — only for fills that need to read AS white
   *  regardless of theme (e.g. text over dark photos). */
  white:      '#ffffff',

  /* ── Surface overlays (light theme) ────────────────────────── */
  /** Row hover bg. Same alpha as Apple Music macOS. */
  hover:        'rgba(14, 14, 26, 0.05)',
  /** Active / pressed accent on a row. */
  accent:       'rgba(14, 14, 26, 0.07)',
  /** Stronger hover (icon-button bg on hover). */
  hoverStrong:  'rgba(14, 14, 26, 0.08)',
  /** Card tint — a barely-there elevation step (Up Next overlay). */
  tint:         'rgba(0, 0, 0, 0.025)',

  /* ── Hairline borders ──────────────────────────────────────── */
  /** Default 1-px divider (most cards / sections). */
  divider:        'rgba(14, 14, 26, 0.10)',
  /** Slightly stronger divider for emphasis (modal edges). */
  dividerStrong:  'rgba(0, 0, 0, 0.12)',

  /* ── Overlays / scrims ─────────────────────────────────────── */
  /** Black 45% — sits over album artwork on hover. */
  overlayDim:     'rgba(0, 0, 0, 0.45)',
  /** Black 18% — drop-shadow base (used inside `shadowMd`). */
  shadowAlpha:    'rgba(0, 0, 0, 0.16)',

  /* ── Pre-baked box-shadows ─────────────────────────────────── */
  /** Hero / floating panel — 12 px y-offset, 28 px blur. */
  shadowMd:       '0 12px 28px rgba(0, 0, 0, 0.16)',
  /** Same depth, dark theme — 32% black for visibility on dark bg. */
  shadowMdDark:   '0 12px 28px rgba(0, 0, 0, 0.32)',
  /** Up Next overlay — shadow points UP (negative y-offset). */
  shadowUp:       '0 -12px 28px rgba(0, 0, 0, 0.10)',
  /** Same, dark theme. */
  shadowUpDark:   '0 -12px 28px rgba(0, 0, 0, 0.32)',

  /* ── Dark theme ────────────────────────────────────────────── */
  onDark:         '#f5f5f7',  // primary text on dark
  onDark2:        '#a8a8b3',  // secondary text on dark
  paperDark:      'rgba(15, 15, 20, 0.55)',  // frosted nav bg
  paperDarkSolid: 'rgba(20, 20, 24, 0.96)',  // overlay surfaces
  tintDark:       'rgba(255, 255, 255, 0.04)',  // card tint
  hoverDark:      'rgba(255, 255, 255, 0.08)',  // row hover
  accentDark:     'rgba(255, 255, 255, 0.12)',  // active row
  dividerDark:    'rgba(255, 255, 255, 0.12)',  // hairline
  dividerDarkStrong: 'rgba(255, 255, 255, 0.16)',

  /* ── Brand / chromatic accents (use sparingly) ─────────────── */
  /** Apple Music brand red — only for "open in Apple Music" CTAs. */
  appleRed:    '#FA243C',
  /** Heart / loved emotion — filled-heart state + heart count meta.
   *  The ONLY chromatic accent allowed in the rail's monochrome system. */
  heartRed:    '#ff375f',
  /** Live mode toggle — iOS-style green. */
  liveGreen:   '#34c759',

  /* ── Olympic medal palette (TOP PLAYLISTS rank 1/2/3) ──────── */
  medalGold:   '#f5b301',
  medalSilver: '#b6b6c1',
  medalBronze: '#c97a4a',
} as const;

// ─── Legacy aliases ────────────────────────────────────────────
// Keep the old token names working while the codebase migrates to
// `COLOR.*`. New code should always reach for `COLOR.*`; these
// aliases will be removed once every reference is on the new API.

/** @deprecated use `COLOR.appleRed` */
export const APPLE_RED = COLOR.appleRed;
/** @deprecated use `COLOR.heartRed` */
export const HEART_RED = COLOR.heartRed;
/** @deprecated use `COLOR.ink` */
export const INK = COLOR.ink;
/** @deprecated use `COLOR.paper` */
export const PAPER = COLOR.paper;
/** @deprecated use `COLOR.ink3` */
export const MUTED = COLOR.ink3;
/** @deprecated use `COLOR.divider` */
export const DIVIDER = COLOR.divider;
/** @deprecated use `COLOR.hover` */
export const HOVER_BG = COLOR.hover;

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

/** UI fonts. Apple SF Pro stack with Pretendard fallback for
 *  Korean glyphs and IBM Plex Mono kept ONLY for technical
 *  labels (Plus Code, geohash, m / F counters). Aligning with
 *  the landing / mypage / auth pages which already moved to SF.
 *
 *  Why mono is still here: Apple's own design system uses SF
 *  Mono in developer-tool contexts (Xcode, Console). For OSM
 *  / Plus-Code / coordinate readouts the mono digits stay
 *  legible without forcing tabular-nums everywhere. */
export const FONT = {
  ui:   '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Pretendard Variable", "Pretendard", "Inter", system-ui, sans-serif',
  mono: '"SF Mono", ui-monospace, "IBM Plex Mono", Menlo, monospace',
};

/** ── 4-multiple type ladder ───────────────────────────────────
 *  Every fontSize used in the rail snaps to a 4-multiple for
 *  visual rhythm with the box / spacing grid. Three readable tiers
 *  cover everything the rail needs:
 *
 *    Display 20 — playlist hero headline
 *    Title   16 — row titles (track / playlist / curator)
 *    Body    12 — captions, metadata, counts, eyebrows (uppercase
 *                 + tracking carries the eyebrow weight visually)
 *
 *  Anything BELOW 12 was unreadable on dense rails; bumping eyebrow
 *  10 → 12 also fixes the WCAG min-text contrast guidance.
 *  ─────────────────────────────────────────────────────────────── */

/** Eyebrow / section header label — uppercase 12 px with em-based
 *  tracking. Visual hierarchy comes from CASE + tracking + weight,
 *  not from a smaller font (which fell off the 4-multiple grid). */
export const EYEBROW = {
  fontFamily: FONT.ui,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

/** Panel-level header (PLACE / MUSIC dot+label). Same on both
 *  floating panels so they read as a paired design system. */
export const PANEL_HEADER = {
  fontFamily: FONT.ui,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
};

/** Section header within a panel (TENANTS / TOP PLAYLISTS / TOP
 *  PICKS / MY PLAYLIST / AI 추천 …). Bumped 11 → 12 so it sits on
 *  the same body tier as captions; weight + tracking + uppercase
 *  carry the eyebrow voice. */
export const SECTION_HEADER = {
  fontFamily: FONT.ui,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
};

/** Body / Caption — secondary line under a row's title (artist
 *  name, "@alias", "수록곡 N곡", curator handle, count badges).
 *  Single 12-px spec for everything below the title tier so the
 *  rail's small text reads as one voice. */
export const ROW_CAPTION = {
  fontFamily: FONT.ui,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '-0.01em',
  lineHeight: 1.3,
};

/** Row title — track name, playlist name, curator's display name.
 *  16 px / 600 / -0.01em — the title tier of the 4-multiple ladder.
 *  Use directly via spread (e.g. `style={{ ...ROW_TITLE, color: text }}`). */
export const ROW_TITLE = {
  fontFamily: FONT.ui,
  fontSize: 16,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  lineHeight: 1.3,
};

/** Compact pill-style trailing button (heart + count, etc.).
 *  Use this when an icon pairs with a tiny number badge — it keeps
 *  glyph-to-digit gap tight (8 px) instead of locking each into a
 *  32-px wide slot, which left visible whitespace between them.
 *
 *  Apply with `style={{ ...COMPACT_PILL_BUTTON }}` then layer on
 *  state-specific color / weight / aria-pressed handlers. */
export const COMPACT_PILL_BUTTON = {
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  gap: 8,
  padding: '0 8px',
  minHeight: 32,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer' as const,
  fontFamily: FONT.ui,
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
} as const;

/** Hero headline — playlist detail hero, modal titles. 16 / 700.
 *  Compact 2-tier ladder: hero shares the title tier's size and
 *  carries emphasis via weight (700 vs 600) instead of a separate
 *  larger size. Keeps the rail visually quiet — even the biggest
 *  text on screen never towers above the row titles. */
export const HERO_HEADLINE = {
  fontFamily: FONT.ui,
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: '-0.01em',
  lineHeight: 1.2,
};

/** Apple typography ladder for sans-serif body / heading text on
 *  the map app. Mirrors the landing / mypage / auth tokens so a
 *  single visual vocabulary spans every surface. Optional —
 *  components can adopt these as they migrate; the existing inline
 *  styles still work unchanged. */
export const TYPE = {
  display:  { fontFamily: FONT.ui, fontWeight: 700, letterSpacing: '-0.005em', lineHeight: 1.08 },
  headline: { fontFamily: FONT.ui, fontWeight: 700, letterSpacing: '-0.003em', lineHeight: 1.12 },
  title:    { fontFamily: FONT.ui, fontWeight: 600, letterSpacing: '0.011em',  lineHeight: 1.19 },
  body:     { fontFamily: FONT.ui, fontWeight: 400, letterSpacing: '-0.022em', lineHeight: 1.47 },
  caption:  { fontFamily: FONT.ui, fontWeight: 400, letterSpacing: '-0.016em', lineHeight: 1.286 },
} as const;

/** Floating-panel inner padding. Both leftPanel and rightPanel use
 *  this so their content columns line up edge-to-edge. */
export const PANEL_PADDING = '14px 18px 18px';

// ─── Spacing scale (8pt grid) ────────────────────────────────────────
//
// HIG + Material both rest on an 8pt grid; everything in VIBLOC's UI
// chrome should use one of these stops. 4 is the sub-grid for tight
// vertical rhythm (icon ↔ label gaps). Above 24 we double-up to 32 / 48
// for hero spacing — never 28 / 36 / 40 (off-grid).
//
// Pattern: import SPACE; use SPACE[3] (= 12) instead of magic 12.
export const SPACE = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
} as const;
