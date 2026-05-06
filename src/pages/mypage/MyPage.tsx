/**
 * MyPage — Apple-system rebuild with full KR/EN/JA i18n.
 *
 * All visible strings flow through `useT()` so the language toggle
 * in the footer / map app updates this page instantly. Relative
 * times use `useTimeAgo()` so "3시간 전 / 3 hr ago / 3時間前" all
 * reflect the active locale.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { isDevAdmin } from '@/features/auth/devAdmin';
import { useProfileData } from '@/features/profile/useProfileData';
import { useBuildingResolver } from '@/features/profile/useBuildingResolver';
import { useT, useTimeAgo } from '@/lib/app/i18n';
import { useDarkMode } from '@/lib/app/useDarkMode';
import { MarqueeText } from '@/components/ui/music/MarqueeText';

const fontStack =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Pretendard Variable", "Pretendard", "Inter", sans-serif';

/** Apple light + dark palettes. The runtime `getC(dark)` picks one
 *  so every surface (page bg, cards, dividers, primary action) is
 *  one consistent system per mode. Dark values follow Apple's
 *  iOS/macOS dark mode spec (true black bg, #1c1c1e elevated cards,
 *  #f5f5f7 primary text, Apple Blue dark-variant #2997ff). */
const C_LIGHT = {
  bg: '#fbfbfd',
  bgAlt: '#f5f5f7',
  cardBg: '#ffffff',
  primary: '#1d1d1f',
  secondary: '#6e6e73',
  divider: 'rgba(0,0,0,0.07)',
  border: 'rgba(0,0,0,0.12)',
  // Neutral accent — Apple Blue suppressed in favor of high-contrast
  // INK so the page doesn't introduce a competing brand colour.
  blue: '#0e0e1a',
  blueHover: '#2a2a35',
  danger: '#a8261b',
  dangerBg: '#fff1f1',
  dangerBorder: '#f7caca',
  cta: '#1d1d1f',
  ctaText: '#ffffff',
} as const;

/** Apple Settings.app dark spec — bumped one elevation step from
 *  the iOS systemBackground stack so true-black + near-black-card
 *  doesn't crush the visual hierarchy. New stops:
 *    bg     = #1c1c1e (was #000)  — base
 *    bgAlt  = #2c2c2e (was #1c1c1e) — section gray, one elev up
 *    cardBg = #2c2c2e (was #1c1c1e) — cards distinct from base
 *    secondary text bumped 0.6 → 0.65 for better contrast on bgAlt
 *    divider 0.10 → 0.14 + border 0.18 → 0.22 so hairlines actually
 *    register on the lifted surfaces. */
const C_DARK = {
  bg: '#1c1c1e',
  bgAlt: '#2c2c2e',
  cardBg: '#2c2c2e',
  primary: '#f5f5f7',
  secondary: 'rgba(235,235,245,0.65)',
  divider: 'rgba(255,255,255,0.14)',
  border: 'rgba(255,255,255,0.22)',
  blue: '#f5f5f7',
  blueHover: '#e0e0e8',
  danger: '#ff6961',
  dangerBg: 'rgba(255,105,97,0.12)',
  dangerBorder: 'rgba(255,105,97,0.35)',
  cta: '#f5f5f7',
  ctaText: '#1d1d1f',
} as const;

/** Palette shape — widened from `typeof C_LIGHT` so DARK can actually
 *  satisfy it (the literal type from `as const` would force the dark
 *  bg to literally equal "#fbfbfd"). Each property is `string` so
 *  the runtime resolver can return either palette safely. */
type Palette = { [K in keyof typeof C_LIGHT]: string };
function getC(dark: boolean): Palette {
  return dark ? C_DARK : C_LIGHT;
}

const T = {
  display: { fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 700, letterSpacing: '-0.005em', lineHeight: 1.08 } as const,
  headline: { fontSize: 'clamp(24px, 2.8vw, 32px)', fontWeight: 700, letterSpacing: '-0.003em', lineHeight: 1.12 } as const,
  title: { fontSize: 21, fontWeight: 600, letterSpacing: '0.011em', lineHeight: 1.19 } as const,
  body: { fontSize: 17, fontWeight: 400, letterSpacing: '-0.022em', lineHeight: 1.47 } as const,
  caption: { fontSize: 14, fontWeight: 400, letterSpacing: '-0.016em', lineHeight: 1.286 } as const,
  helper: { fontSize: 12, fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.33 } as const,
  eyebrow: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.06em',
    lineHeight: 1.33,
    textTransform: 'uppercase' as const,
  } as const,
} as const;

const TAG_PRESETS = [
  'K-Pop', 'J-Pop', 'Hip-Hop', 'R&B', 'Jazz', 'Lo-fi',
  'Indie', 'Rock', 'EDM', 'Classical', 'Ambient', 'City Pop',
  'Soul', 'Funk', 'Reggae', 'Latin', 'Metal', 'Blues',
] as const;

function sectionDividerOf(C: Palette): React.CSSProperties {
  // Match the landing page's section rhythm: hairline + breathable
  // 64 px lift. The previous 56/56 was a touch tight against display
  // headlines. clamp lets compact viewports stay denser.
  return {
    borderTop: `1px solid ${C.divider}`,
    paddingTop: 'clamp(48px, 6vw, 72px)' as unknown as number,
    marginTop: 'clamp(48px, 6vw, 72px)' as unknown as number,
  };
}

function PillPrimary({ to, onClick, children, disabled, type, C }: {
  to?: string;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit';
  C: Palette;
}) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 22px',
    borderRadius: 980,
    background: C.cta,
    color: C.ctaText,
    fontSize: 17,
    fontWeight: 400,
    letterSpacing: '-0.022em',
    lineHeight: 1.176,
    fontFamily: 'inherit',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    textDecoration: 'none',
    transition: 'background 120ms ease, opacity 120ms ease',
  };
  // Hover: subtle 0.85 opacity instead of swapping background to
  // C.blue (which after the blue-suppression change collapses to
  // the same value as C.cta in some palettes — making the hover
  // invisible). Opacity hover is mode-agnostic.
  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    if (!disabled) e.currentTarget.style.opacity = '0.85';
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    if (!disabled) e.currentTarget.style.opacity = '1';
  };
  if (to) {
    return (
      <Link to={to} style={baseStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      disabled={disabled}
      style={baseStyle}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {children}
    </button>
  );
}

function PillGhost({ to, onClick, children, danger, C }: {
  to?: string;
  onClick?: () => void;
  children: React.ReactNode;
  danger?: boolean;
  C: Palette;
}) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '11px 22px',
    borderRadius: 980,
    background: danger ? C.dangerBg : 'transparent',
    color: danger ? C.danger : C.primary,
    fontSize: 17,
    fontWeight: 400,
    letterSpacing: '-0.022em',
    lineHeight: 1.176,
    fontFamily: 'inherit',
    border: `1px solid ${danger ? C.dangerBorder : C.border}`,
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'background 120ms ease, border-color 120ms ease',
  };
  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = danger ? C.danger : C.primary;
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = danger ? C.dangerBorder : C.border;
  };
  if (to) {
    return (
      <Link to={to} style={baseStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {children}
    </button>
  );
}

export function MyPage() {
  const navigate = useNavigate();
  const t = useT();
  const timeAgo = useTimeAgo();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const admin = isDevAdmin();
  const { playlists, stats } = useProfileData();
  const resolver = useBuildingResolver();
  const formatBuilding = resolver.format;
  // Pull the global dark-mode flag and resolve the active palette
  // once per render. Every C.foo reference downstream auto-flips
  // when the user toggles dark mode anywhere in the product.
  const dark = useDarkMode();
  const C = getC(dark);
  const sectionDivider = sectionDividerOf(C);

  const [tags, setTags] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vibloc-user-tags');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [customTag, setCustomTag] = useState('');
  const [showAllPlaylists, setShowAllPlaylists] = useState(false);

  const saveTags = (next: string[]) => {
    setTags(next);
    localStorage.setItem('vibloc-user-tags', JSON.stringify(next));
  };
  const toggleTag = (tag: string) => {
    saveTags(tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag]);
  };
  const addCustomTag = () => {
    const tag = customTag.trim();
    if (!tag || tags.includes(tag)) return;
    saveTags([...tags, tag]);
    setCustomTag('');
  };

  /* ── Not logged in ── */
  if (!user) {
    return (
      <div
        style={{
          background: C.bg,
          minHeight: '100dvh',
          fontFamily: fontStack,
          color: C.primary,
          paddingTop: 44,
        }}
      >
        <div
          style={{
            maxWidth: 980,
            margin: '0 auto',
            padding: '120px 22px 80px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 24,
          }}
        >
          <h1 style={{ ...T.headline, margin: 0, color: C.primary }}>
            {t('mypage.notLoggedIn.title')}
          </h1>
          <p style={{ ...T.body, color: C.secondary, margin: 0, maxWidth: 480 }}>
            {t('mypage.notLoggedIn.body')}
          </p>
          <PillPrimary C={C} to="/login">{t('nav.login')}</PillPrimary>
        </div>
      </div>
    );
  }

  const visiblePlaylists = showAllPlaylists ? playlists : playlists.slice(0, 4);

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100dvh',
        fontFamily: fontStack,
        color: C.primary,
        paddingTop: 44,
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: '0 auto',
          padding: '80px 22px 120px',
        }}
      >
        {/* ━━━ PROFILE HEADER ━━━ */}
        <div>
          <p style={{ ...T.eyebrow, color: C.secondary, margin: 0 }}>{t('nav.profile')}</p>
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <h1 style={{ ...T.display, color: C.primary, margin: 0 }}>
              {user.displayName ?? user.email}
            </h1>
            {admin ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '4px 10px',
                  borderRadius: 980,
                  background: C.primary,
                  // Inverse-of-primary text so the badge stays
                  // legible in both modes (white-on-cream invisible
                  // in dark mode otherwise).
                  color: C.bg,
                }}
              >
                Admin
              </span>
            ) : null}
          </div>
          <p style={{ ...T.body, color: C.secondary, marginTop: 8, marginBottom: 0 }}>
            {user.email}
          </p>
        </div>

        {/* ━━━ STATS ━━━ */}
        <div style={sectionDivider}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
            }}
          >
            {[
              { value: String(stats.totalTracks), label: t('mypage.stats.tracks') },
              { value: String(stats.totalBuildings), label: t('mypage.stats.buildings') },
              { value: String(tags.length), label: t('mypage.stats.tags') },
            ].map((s, i) => (
              <div
                key={s.label}
                style={{
                  textAlign: 'center',
                  padding: '0 16px',
                  borderLeft: i === 0 ? 'none' : `1px solid ${C.divider}`,
                }}
              >
                <div
                  style={{
                    fontSize: 'clamp(40px, 5vw, 64px)',
                    fontWeight: 700,
                    letterSpacing: '-0.005em',
                    lineHeight: 1,
                    color: C.primary,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {s.value}
                </div>
                <div style={{ ...T.body, color: C.secondary, marginTop: 12 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ━━━ TOP GENRES ━━━ */}
        {stats.topGenres.length > 0 ? (
          <div style={sectionDivider}>
            <p style={{ ...T.eyebrow, color: C.secondary, margin: 0 }}>
              {t('mypage.genres.eyebrow')}
            </p>
            <h2 style={{ ...T.headline, color: C.primary, marginTop: 12, marginBottom: 24 }}>
              {t('mypage.genres.headline')}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {stats.topGenres.map(({ genre, count, color, label }) => (
                <div
                  key={genre}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 18px',
                    borderRadius: 980,
                    background: C.cardBg,
                    border: `1px solid ${C.divider}`,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ ...T.body, fontWeight: 500, color: C.primary, lineHeight: 1.2 }}>
                    {label}
                  </span>
                  <span style={{ ...T.caption, color: C.secondary, fontVariantNumeric: 'tabular-nums' }}>
                    {t('mypage.tracksCount', { n: count })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* ━━━ PLAYLISTS ━━━ */}
        <div style={sectionDivider}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <p style={{ ...T.eyebrow, color: C.secondary, margin: 0 }}>
                {t('mypage.playlists.eyebrow')}
              </p>
              <h2 style={{ ...T.headline, color: C.primary, marginTop: 12, marginBottom: 0 }}>
                {t('mypage.playlists.headline')}
              </h2>
            </div>
            {playlists.length > 0 ? (
              <span
                style={{
                  ...T.caption,
                  color: C.secondary,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t('mypage.playlists.buildingsCount', { n: playlists.length })}
              </span>
            ) : null}
          </div>

          {playlists.length === 0 ? (
            <div
              style={{
                marginTop: 28,
                background: C.cardBg,
                borderRadius: 28,
                padding: '60px 32px',
                textAlign: 'center',
              }}
            >
              <p style={{ ...T.title, color: C.primary, margin: 0 }}>
                {t('mypage.playlists.emptyTitle')}
              </p>
              <p style={{ ...T.body, color: C.secondary, marginTop: 8, marginBottom: 24 }}>
                {t('mypage.playlists.emptyBody')}
              </p>
              <PillPrimary C={C} to="/map">{t('mypage.playlists.emptyCta')}</PillPrimary>
            </div>
          ) : (
            // 2-column grid (1-column on narrow viewports). Larger
            // artwork + clearer hierarchy: Title row (building name +
            // track count) → Description (italic-feel via secondary) →
            // Top track on its own line with a small genre dot → meta
            // row (last activity + quick-jump). Generous 24 padding
            // and 20 gap make each card breathable; hover lifts 2 px
            // with a subtle shadow for a tactile feel that matches
            // the landing's feature cards.
            <div
              style={{
                marginTop: 32,
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 20,
              }}
            >
              {visiblePlaylists.map((pl) => {
                const arts = pl.tracks.slice(0, 4).map((tr) => tr.artworkUrl).filter(Boolean);
                const trackCount = pl.tracks.length;
                const topTrack = [...pl.tracks].sort((a, b) => b.pinnedAt - a.pinnedAt)[0];
                const info = resolver.info(pl.buildingId);
                const mapHref = info
                  ? `/map?area=${info.cityKey}&building=${encodeURIComponent(pl.buildingId)}`
                  : `/map?building=${encodeURIComponent(pl.buildingId)}`;
                const detailHref = `/mypage/playlist/${pl.buildingId}`;
                return (
                  <Link
                    key={pl.buildingId}
                    to={detailHref}
                    className="vbk-card-mq"
                    style={{
                      background: C.cardBg,
                      borderRadius: 28,
                      padding: 24,
                      display: 'flex',
                      gap: 18,
                      textDecoration: 'none',
                      color: 'inherit',
                      transition: 'transform 160ms ease, box-shadow 160ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = dark
                        ? '0 6px 24px rgba(0,0,0,0.45)'
                        : '0 6px 24px rgba(0,0,0,0.06)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {/* Artwork — bumped 64 → 80 for visual weight in
                        the wider 2-col layout. 4-track mosaic falls
                        back to a single image / empty tile. */}
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 16,
                        overflow: 'hidden',
                        flexShrink: 0,
                        background: C.bgAlt,
                      }}
                    >
                      {arts.length >= 4 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', width: '100%', height: '100%' }}>
                          {arts.slice(0, 4).map((url, i) => (
                            <img key={i} src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                          ))}
                        </div>
                      ) : arts.length > 0 ? (
                        <img src={arts[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: C.bgAlt }} />
                      )}
                    </div>
                    {/* Info column — title / track preview / meta row */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* Title row: building name (marquees on card
                          hover when truncated) + track count chip */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                        <MarqueeText
                          text={formatBuilding(pl.buildingId)}
                          title={formatBuilding(pl.buildingId)}
                          disableClick
                          style={{
                            ...T.title,
                            color: C.primary,
                            lineHeight: 1.2,
                            flex: 1,
                            minWidth: 0,
                          }}
                        />
                        <span
                          style={{
                            ...T.helper,
                            color: C.secondary,
                            fontVariantNumeric: 'tabular-nums',
                            flexShrink: 0,
                            padding: '2px 8px',
                            borderRadius: 980,
                            background: C.bgAlt,
                          }}
                        >
                          {t('mypage.tracksCount', { n: trackCount })}
                        </span>
                      </div>
                      {/* Optional description — only when present */}
                      {pl.description ? (
                        <p style={{ ...T.caption, color: C.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                          {pl.description}
                        </p>
                      ) : null}
                      {/* Top track preview — marquees on card hover.
                          Single MarqueeText takes the combined string
                          so the artist follows the track name in one
                          continuous scroll. Color split via CSS isn't
                          possible inside the marquee; using the same
                          primary color keeps it readable. */}
                      {topTrack ? (
                        <MarqueeText
                          text={`${topTrack.trackName} — ${topTrack.artistName}`}
                          title={`${topTrack.trackName} — ${topTrack.artistName}`}
                          disableClick
                          style={{
                            ...T.body,
                            color: C.primary,
                            fontWeight: 500,
                            lineHeight: 1.4,
                          }}
                        />
                      ) : null}
                      {/* Meta row: last activity (left) + quick jump (right) */}
                      <div
                        style={{
                          marginTop: 'auto',
                          paddingTop: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <span style={{ ...T.helper, color: C.secondary, opacity: 0.8 }}>
                          {timeAgo(pl.lastActivity)}
                        </span>
                        {/* Quick-jump pill — preventDefault stops the
                            parent <Link> from also navigating to the
                            detail page. Sits on the right of the meta
                            row instead of the original far-right of
                            the card so the artwork + title hierarchy
                            stays uncluttered. */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(mapHref);
                          }}
                          aria-label={t('mypage.playlists.quickJumpAria')}
                          style={{
                            flexShrink: 0,
                            padding: '6px 12px',
                            borderRadius: 980,
                            background: 'transparent',
                            color: C.primary,
                            ...T.helper,
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            lineHeight: 1.2,
                            border: `1px solid ${C.divider}`,
                            cursor: 'pointer',
                            transition: 'background 120ms ease, border-color 120ms ease',
                            fontFamily: 'inherit',
                            whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = C.bgAlt;
                            e.currentTarget.style.borderColor = C.primary;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.borderColor = C.divider;
                          }}
                        >
                          {t('mypage.playlists.quickJump')} ›
                        </button>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {playlists.length > 4 ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
              <PillGhost C={C} onClick={() => setShowAllPlaylists(!showAllPlaylists)}>
                {showAllPlaylists
                  ? t('mypage.playlists.collapse')
                  : t('mypage.playlists.viewMore', { n: playlists.length - 4 })}
              </PillGhost>
            </div>
          ) : null}
        </div>

        {/* ━━━ RECENT ACTIVITY ━━━ */}
        {stats.recentTracks.length > 0 ? (
          <div style={sectionDivider}>
            <p style={{ ...T.eyebrow, color: C.secondary, margin: 0 }}>
              {t('mypage.recent.eyebrow')}
            </p>
            <h2 style={{ ...T.headline, color: C.primary, marginTop: 12, marginBottom: 24 }}>
              {t('mypage.recent.headline')}
            </h2>
            <div
              style={{
                background: C.cardBg,
                borderRadius: 22,
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {stats.recentTracks.map((tr, i) => (
                <div
                  key={`${tr.id}-${tr.buildingId}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 14px',
                    borderRadius: 14,
                    transition: 'background 120ms ease',
                    cursor: 'default',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = C.bgAlt; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <img
                    src={tr.artworkUrl}
                    alt=""
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                    loading="lazy"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        ...T.body,
                        fontWeight: 600,
                        color: C.primary,
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tr.trackName}
                    </div>
                    <div
                      style={{
                        ...T.caption,
                        color: C.secondary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tr.artistName} · {formatBuilding(tr.buildingId)}
                    </div>
                  </div>
                  <span
                    style={{
                      ...T.helper,
                      color: C.secondary,
                      flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {timeAgo(tr.pinnedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* ━━━ INTEREST TAGS ━━━ */}
        <div style={sectionDivider}>
          <p style={{ ...T.eyebrow, color: C.secondary, margin: 0 }}>{t('mypage.tags.eyebrow')}</p>
          <h2 style={{ ...T.headline, color: C.primary, marginTop: 12, marginBottom: 8 }}>
            {t('mypage.tags.headline')}
          </h2>
          <p style={{ ...T.body, color: C.secondary, marginTop: 0, marginBottom: 24 }}>
            {t('mypage.tags.body')}
          </p>

          {/* Preset chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {TAG_PRESETS.map((tag) => {
              const active = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 980,
                    border: `1px solid ${active ? C.primary : C.divider}`,
                    background: active ? C.primary : C.cardBg,
                    // Inverse-of-primary text on the active fill so
                    // dark-mode chip (cream bg) reads correctly.
                    color: active ? C.bg : C.primary,
                    ...T.body,
                    fontWeight: 500,
                    lineHeight: 1.2,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'border-color 120ms ease, background 120ms ease, color 120ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.borderColor = C.primary;
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.borderColor = C.divider;
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          {/* Custom tag input */}
          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
              placeholder={t('mypage.tags.placeholder')}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '12px 16px',
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.cardBg,
                ...T.body,
                color: C.primary,
                outline: 'none',
                transition: 'border-color 180ms, box-shadow 180ms',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                // Neutral focus halo — replaces the legacy Apple-Blue
                // glow (rgba 0,113,227) which clashed with the rest
                // of the blue-suppressed system. Light mode uses an
                // ink-tinted ring, dark mode a cream-tinted one — the
                // C.primary alpha derivation keeps either palette
                // self-consistent.
                e.currentTarget.style.borderColor = C.primary;
                e.currentTarget.style.boxShadow = `0 0 0 4px ${C.divider}`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = C.border;
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <PillPrimary C={C} onClick={addCustomTag} disabled={!customTag.trim()}>
              {t('mypage.tags.add')}
            </PillPrimary>
          </div>

          {/* Selected tags */}
          {tags.length > 0 ? (
            <div style={{ marginTop: 24 }}>
              <p style={{ ...T.eyebrow, color: C.secondary, margin: 0, marginBottom: 12 }}>
                {t('mypage.tags.myTagsCount', { n: tags.length })}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 14px',
                      borderRadius: 980,
                      background: C.bgAlt,
                      ...T.caption,
                      fontWeight: 500,
                      color: C.primary,
                    }}
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => toggleTag(tag)}
                      aria-label={t('mypage.tags.removeAria', { tag })}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        fontSize: 16,
                        lineHeight: 1,
                        color: C.secondary,
                        cursor: 'pointer',
                        transition: 'color 150ms',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = C.primary; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = C.secondary; }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* ━━━ ACTIONS ━━━ */}
        <div
          style={{
            marginTop: 56,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <PillPrimary C={C} to="/map">{t('mypage.actions.toMap')}</PillPrimary>
          <PillGhost
            C={C}
            onClick={() => {
              clearSession();
              navigate('/');
            }}
            danger
          >
            {t('mypage.actions.logout')}
          </PillGhost>
        </div>
      </div>
    </div>
  );
}
