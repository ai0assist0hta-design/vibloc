/**
 * PlaylistDetailPage — Apple-style expanded view of a single
 * pinned-building playlist. Reached from the MyPage card click.
 *
 * Layout: eyebrow + headline (city · building) + meta row (track
 * count · last activity), two pill actions (맵에서 열기 / 마이페이지로),
 * then the full track list.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Info, MoreHorizontal, Share2, Trash2, X } from 'lucide-react';
import { useProfileData } from '@/features/profile/useProfileData';
import { useBuildingResolver } from '@/features/profile/useBuildingResolver';
import { useT, useTimeAgo } from '@/lib/app/i18n';
import { useDarkMode } from '@/lib/app/useDarkMode';
import { unpinTrack, usePlaylist } from '@/lib/music/buildingPlaylist';
import { openAppleMusic } from '@/lib/share/openAppleMusic';
import type { PinnedTrack } from '@/lib/music/buildingPlaylist';

const fontStack =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Pretendard Variable", "Pretendard", "Inter", sans-serif';

/** Apple light + dark palettes — same pair as MyPage so the two
 *  surfaces stay visually paired when the user toggles. */
const C_LIGHT = {
  bg: '#fbfbfd',
  bgAlt: '#f5f5f7',
  cardBg: '#ffffff',
  primary: '#1d1d1f',
  secondary: '#6e6e73',
  divider: 'rgba(0,0,0,0.07)',
  border: 'rgba(0,0,0,0.12)',
  // Neutral accent (Apple Blue suppressed). Same pair as
  // MyPage / Auth forms so all logged-in surfaces share one palette.
  blue: '#0e0e1a',
  blueHover: '#2a2a35',
  ctaText: '#ffffff',
} as const;
// Same Apple Settings.app dark stops as MyPage — see notes there.
// One-elevation lift from true-black so cards register against bg.
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
  ctaText: '#0e0e1a',
} as const;
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

function PillPrimary({
  to, onClick, children, C,
}: { to?: string; onClick?: () => void; children: React.ReactNode; C: Palette }) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px 22px',
    borderRadius: 980,
    background: C.blue,
    color: C.ctaText,
    fontSize: 17,
    fontWeight: 400,
    letterSpacing: '-0.022em',
    lineHeight: 1.176,
    fontFamily: 'inherit',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'background 120ms ease',
  };
  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = C.blueHover;
  };
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.background = C.blue;
  };
  if (to) {
    return (
      <Link to={to} style={baseStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} style={baseStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {children}
    </button>
  );
}

function PillGhost({ to, children, C }: { to: string; children: React.ReactNode; C: Palette }) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '11px 22px',
    borderRadius: 980,
    background: 'transparent',
    color: C.primary,
    fontSize: 17,
    fontWeight: 400,
    letterSpacing: '-0.022em',
    lineHeight: 1.176,
    fontFamily: 'inherit',
    border: `1px solid ${C.border}`,
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'border-color 120ms ease',
  };
  return (
    <Link
      to={to}
      style={baseStyle}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.primary)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
    >
      {children}
    </Link>
  );
}

export function PlaylistDetailPage() {
  // OSM ids contain a slash ("way/123"), so the route uses a splat
  // (`/mypage/playlist/*`). React Router exposes the splat at `*`,
  // already decoded — that matches the playlist key on disk.
  const params = useParams();
  const buildingId = params['*'] ?? '';
  const navigate = useNavigate();
  const t = useT();
  const timeAgo = useTimeAgo();
  const dark = useDarkMode();
  const C = getC(dark);
  const { playlists } = useProfileData();
  // Subscribe directly to the building-playlist listener system so
  // the page re-renders the moment a track is unpinned (without
  // waiting for storage / focus events). Falls back to the
  // useProfileData snapshot for the description + lastActivity bits
  // that aren't in the live hook.
  const live = usePlaylist(buildingId);
  const resolver = useBuildingResolver();
  const playlist = useMemo(() => {
    // Prefer live tracks; merge in description/lastActivity from the
    // profile data when present.
    const fromProfile = playlists.find((p) => p.buildingId === buildingId);
    if (live.tracks.length === 0 && !fromProfile) return null;
    const tracks = live.tracks.length > 0 ? live.tracks : fromProfile?.tracks ?? [];
    const description = live.description || fromProfile?.description || '';
    const lastActivity = tracks.length > 0
      ? Math.max(...tracks.map((t) => t.pinnedAt ?? 0))
      : fromProfile?.lastActivity ?? 0;
    return { buildingId, tracks, description, lastActivity };
  }, [live, playlists, buildingId]);

  // Sort tracks newest first (most recent pin on top), matching the
  // map-side BuildingPlaylist surface.
  const sortedTracks = useMemo(() => {
    if (!playlist) return [];
    return [...playlist.tracks].sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
  }, [playlist]);

  const cityLabel = resolver.cityLabel(buildingId);
  const buildingName = resolver.name(buildingId);
  const info = resolver.info(buildingId);

  const mapHref = info
    ? `/map?area=${info.cityKey}&building=${encodeURIComponent(buildingId)}`
    : `/map?building=${encodeURIComponent(buildingId)}`;

  // ── Not found ──
  if (!playlist) {
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
          <h1 style={{ ...T.headline, margin: 0 }}>{t('playlist.notFound.title')}</h1>
          <p style={{ ...T.body, color: C.secondary, margin: 0, maxWidth: 480 }}>
            {t('playlist.notFound.body')}
          </p>
          <PillPrimary C={C} onClick={() => navigate('/mypage')}>{t('playlist.cta.toMypage')}</PillPrimary>
        </div>
      </div>
    );
  }

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
        {/* ━━━ HEADER ━━━ */}
        <div>
          <p style={{ ...T.eyebrow, color: C.secondary, margin: 0 }}>
            {cityLabel ? `${t('playlist.eyebrow')} · ${cityLabel}` : t('playlist.eyebrow')}
          </p>
          <h1 style={{ ...T.display, color: C.primary, margin: '12px 0 0' }}>
            {buildingName}
          </h1>
          <p style={{ ...T.body, color: C.secondary, marginTop: 8, marginBottom: 0 }}>
            {t('playlist.metaUpdated', {
              n: playlist.tracks.length,
              ago: timeAgo(playlist.lastActivity),
            })}
          </p>
          {playlist.description ? (
            <p style={{ ...T.body, color: C.primary, marginTop: 16, marginBottom: 0 }}>
              {playlist.description}
            </p>
          ) : null}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
            <PillPrimary C={C} to={mapHref}>{t('playlist.cta.openMap')}</PillPrimary>
            <PillGhost C={C} to="/mypage">{t('playlist.cta.toMypage')}</PillGhost>
          </div>
        </div>

        {/* ━━━ TRACKS ━━━ */}
        {sortedTracks.length === 0 ? (
          <div
            style={{
              marginTop: 56,
              background: C.cardBg,
              borderRadius: 28,
              padding: '60px 32px',
              textAlign: 'center',
            }}
          >
            <p style={{ ...T.title, color: C.primary, margin: 0 }}>
              {t('playlist.empty.title')}
            </p>
            <p style={{ ...T.body, color: C.secondary, marginTop: 8, marginBottom: 0 }}>
              {t('playlist.empty.body')}
            </p>
          </div>
        ) : (
          <div
            style={{
              marginTop: 56,
              background: C.cardBg,
              borderRadius: 22,
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {sortedTracks.map((tr, i) => (
              <TrackRowItem
                key={`${tr.id}-${i}`}
                index={i}
                track={tr}
                buildingId={buildingId}
                C={C}
                dark={dark}
                t={t}
                timeAgo={timeAgo}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * TrackRowItem
 *
 * Apple Music album-detail row + two trailing actions:
 *
 *   [×]   — direct, single-tap remove (Trash icon). Hidden when the
 *           row isn't hovered (and on touch-only it stays visible
 *           since there's no hover state — covered by `:focus-within`
 *           via React state).
 *   [⋯]   — More menu. Opens a fixed-positioned popover anchored to
 *           the button (matches TrackRow.tsx in the floating queue).
 *           Items: Track info (Apple Music search), Share (copy
 *           link), Remove from playlist.
 *
 * The menu pattern mirrors `TrackMoreMenu` from
 * `src/components/ui/music/TrackRow.tsx` so the visual + behavioural
 * vocabulary stays identical to what users already see in the map's
 * floating queue. Outside-click + Escape dismiss; light/dark surface
 * spec from Apple Settings.app.
 * ───────────────────────────────────────────────────────────────── */
function TrackRowItem({
  index, track, buildingId, C, dark, t, timeAgo,
}: {
  index: number;
  track: PinnedTrack;
  buildingId: string;
  C: Palette;
  dark: boolean;
  t: (k: string, vars?: Record<string, string | number>) => string;
  timeAgo: (ms: number) => string;
}) {
  const [hover, setHover] = useState(false);
  const [removing, setRemoving] = useState(false);

  function handleRemove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (removing) return;
    setRemoving(true);
    // Brief fade so the user sees what's about to disappear; the
    // unpinTrack call notifies all subscribers (including this
    // page's usePlaylist hook) which removes the row from the DOM.
    window.setTimeout(() => unpinTrack(buildingId, track.id), 70);
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 14px',
        borderRadius: 14,
        background: hover ? C.bgAlt : 'transparent',
        opacity: removing ? 0.4 : 1,
        transition: 'background 120ms ease, opacity 120ms ease',
        cursor: 'default',
      }}
    >
      {/* Position number (Apple Music album-detail style) */}
      <span
        style={{
          width: 22,
          textAlign: 'right',
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          color: C.secondary,
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}
      >
        {index + 1}
      </span>
      {/* Artwork */}
      {track.artworkUrl ? (
        <img
          src={track.artworkUrl}
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
      ) : (
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: C.bgAlt,
            flexShrink: 0,
          }}
        />
      )}
      {/* Info */}
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
          title={track.trackName}
        >
          {track.trackName}
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
          {track.artistName}
        </div>
      </div>
      {/* Pinned time */}
      <span
        style={{
          ...T.helper,
          color: C.secondary,
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {timeAgo(track.pinnedAt ?? 0)}
      </span>

      {/* Quick remove (×) — opacity 0.5 idle, 1 on row hover. The
          dedicated button gives one-tap removal without going through
          the more menu. Hides entirely on touch (no hover) but the
          more menu still exposes the same action so it's never
          unreachable. */}
      <RowActionButton
        title={t('playlist.track.removeAria')}
        ariaLabel={t('playlist.track.removeAria')}
        onClick={handleRemove}
        rowHover={hover}
        dark={dark}
        text={C.primary}
        text2={C.secondary}
        danger
      >
        <Trash2 size={15} strokeWidth={2.2} />
      </RowActionButton>

      {/* More menu (...) */}
      <TrackMoreMenu
        track={track}
        buildingId={buildingId}
        C={C}
        dark={dark}
        rowHover={hover}
        onRemove={handleRemove}
        t={t}
      />
    </div>
  );
}

/* ─── Reusable row-action button (28 × 28 ghost circle) ─────────── */
function RowActionButton({
  children, ariaLabel, title, onClick, rowHover, dark, text, text2, danger,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  rowHover: boolean;
  dark: boolean;
  text: string;
  text2: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: '50%',
        border: 'none', background: 'transparent',
        color: text2,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: rowHover ? 1 : 0.5,
        transition: 'opacity 120ms ease, background 120ms ease, color 120ms ease',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger
          ? (dark ? 'rgba(255,105,97,0.15)' : 'rgba(255,80,80,0.10)')
          : (dark ? 'rgba(255,255,255,0.10)' : 'rgba(14,14,26,0.08)');
        e.currentTarget.style.color = danger
          ? (dark ? '#ff8b85' : '#a8261b')
          : text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = text2;
      }}
    >
      {children}
    </button>
  );
}

/* ─── More-options menu — mirrors TrackMoreMenu in TrackRow.tsx ──── */
function TrackMoreMenu({
  track, buildingId, C, dark, rowHover, onRemove, t,
}: {
  track: PinnedTrack;
  buildingId: string;
  C: Palette;
  dark: boolean;
  rowHover: boolean;
  onRemove: (e: React.MouseEvent) => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // buildingId reserved for potential future menu items (e.g. "Open
  // building on map" from a track row). Currently unused but kept in
  // the signature so the wiring is in place.
  void buildingId;

  // Anchor the fixed-positioned menu to the button — re-anchors on
  // window scroll/resize so the popover stays glued.
  useEffect(() => {
    if (!open) { setPos(null); return; }
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({
        top: Math.round(r.bottom + 4),
        right: Math.max(8, Math.round(window.innerWidth - r.right - 4)),
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Outside click + Escape dismiss
  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const tg = ev.target as Node;
      if (btnRef.current?.contains(tg)) return;
      if (menuRef.current?.contains(tg)) return;
      setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const appleSearch = (track.trackName || track.artistName)
    ? `https://music.apple.com/search?term=${encodeURIComponent(
        `${track.trackName ?? ''} ${track.artistName ?? ''}`.trim())}`
    : '';

  function handleInfo(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    if (appleSearch) openAppleMusic(appleSearch);
  }
  function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!appleSearch) return;
    try {
      navigator.clipboard.writeText(appleSearch);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch { /* ignore */ }
  }
  function handleMenuRemove(e: React.MouseEvent) {
    setOpen(false);
    onRemove(e);
  }

  // Apple Settings popover surface
  const menuBg     = dark ? 'rgba(44,44,46,0.95)' : 'rgba(255,255,255,0.95)';
  const menuBorder = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)';
  const menuInk    = C.primary;
  const menuHover  = dark ? 'rgba(255,255,255,0.08)' : 'rgba(14,14,26,0.06)';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label={t('player.menu.more')}
        title={t('player.menu.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: 28, height: 28, borderRadius: '50%',
          border: 'none', background: 'transparent',
          color: C.secondary,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: rowHover || open ? 1 : 0.5,
          transition: 'opacity 120ms ease, background 120ms ease, color 120ms ease',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = dark
            ? 'rgba(255,255,255,0.10)' : 'rgba(14,14,26,0.08)';
          e.currentTarget.style.color = C.primary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = C.secondary;
        }}
      >
        <MoreHorizontal size={16} strokeWidth={2.2} />
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            minWidth: 180,
            maxWidth: 'calc(100vw - 16px)',
            padding: 4,
            borderRadius: 10,
            background: menuBg,
            border: `1px solid ${menuBorder}`,
            backdropFilter: 'blur(20px) saturate(140%)',
            WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            boxShadow: dark
              ? '0 12px 32px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.30)'
              : '0 12px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)',
            color: menuInk,
            fontSize: 13,
            zIndex: 1000,
            display: 'flex', flexDirection: 'column',
          }}
        >
          <MenuItem
            icon={<Info size={14} strokeWidth={2.2} />}
            label={t('player.menu.info')}
            onClick={handleInfo}
            disabled={!appleSearch}
            hoverBg={menuHover}
          />
          <MenuItem
            icon={<Share2 size={14} strokeWidth={2.2} />}
            label={copied ? t('player.menu.copied') : t('player.menu.share')}
            onClick={handleShare}
            disabled={!appleSearch}
            hoverBg={menuHover}
          />
          {/* Hairline separator before destructive action — Apple
              dropdown convention: irreversible items live below a
              divider so they're never the first reflexive target. */}
          <div
            style={{
              height: 1,
              margin: '4px 0',
              background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
            }}
            aria-hidden
          />
          <MenuItem
            icon={<X size={14} strokeWidth={2.2} />}
            label={t('playlist.track.removeMenu')}
            onClick={handleMenuRemove}
            hoverBg={dark ? 'rgba(255,105,97,0.15)' : 'rgba(255,80,80,0.10)'}
            danger
          />
        </div>
      )}
    </>
  );
}

function MenuItem({
  icon, label, onClick, disabled, hoverBg, danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  hoverBg: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%',
        padding: '8px 12px',
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color: danger ? '#ff6961' : 'inherit',
        fontFamily: 'inherit',
        fontSize: 13,
        letterSpacing: '-0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        textAlign: 'left',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ display: 'inline-flex', width: 14, justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}
