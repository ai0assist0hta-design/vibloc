/**
 * Viewport-fixed left tool sidebar.
 *
 * Apple Music macOS pins its navigation rail (Search / Home / New /
 * Radio / Library / Playlists / profile) to the left edge. VIBLOC's
 * parallel: a left rail that hosts every control that's currently
 * scattered across the corners (logo, profile, city dropdown, lang
 * toggle, dark mode toggle, future search) so the chrome reads as
 * one tool palette instead of four floating widgets.
 *
 * Symmetric to FixedQueueSidebar on the right (same 280 px width,
 * same backdrop-blur surface, same collapse mechanic) so the two
 * rails read as a paired design system.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, ChevronLeft, Globe, Moon, Search, Sun, User,
} from 'lucide-react';
import { useT, useI18nStore, type Lang } from '../../lib/app/i18n';
import { CITY_AREAS, type CityAreaKey } from '../../lib/geo/osmLoader';
import { FONT } from '../../lib/ui/tokens';
import { useAuthStore } from '../../features/auth/useAuthStore';

const SIDEBAR_W = 280;

type Props = {
  area: CityAreaKey;
  onSelectArea: (key: CityAreaKey) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onSearchClick?: () => void;
};

export function FixedToolSidebar({
  area, onSelectArea, darkMode, onToggleDarkMode, onSearchClick,
}: Props) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(true);

  const ink     = darkMode ? '#e0e0e8' : '#1a1a2e';
  const muted   = darkMode ? '#8e8e93' : '#6e6e73';
  // Slightly more translucent than Apple Music's rail so the 3D
  // city stays partially readable through the chrome. Edge highlight
  // (`borderRight`) catches viewport light to outline the rail
  // crisply without painting an opaque surface.
  const surface = darkMode ? 'rgba(15,15,20,0.55)' : 'rgba(255,255,255,0.55)';
  const border  = darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
  const hover   = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const accent  = darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(26,26,46,0.06)';

  // Sync collapse state into a body attribute so other fixed surfaces
  // (NowPlayingBar, FixedQueueSidebar) can adjust their margins
  // without prop-drilling. Picked up by index.css selectors.
  useEffect(() => {
    document.body.dataset.tools = open ? 'open' : 'closed';
    return () => { delete document.body.dataset.tools; };
  }, [open]);

  // ── Closed: thin tab handle on the left edge.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('tools.expand')}
        title={t('tools.expand')}
        style={{
          position: 'fixed',
          left: 0, top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 41,
          width: 28, height: 96,
          borderTopRightRadius: 14, borderBottomRightRadius: 14,
          border: 'none',
          background: surface,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: ink, cursor: 'pointer',
          boxShadow: '4px 0 16px rgba(0,0,0,0.10)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ChevronLeft size={16} strokeWidth={2.4} style={{ transform: 'rotate(180deg)' }} />
      </button>
    );
  }

  return (
    <aside
      role="navigation"
      aria-label={t('tools.navLabel')}
      style={{
        position: 'fixed',
        left: 0, top: 0, bottom: 0,
        width: SIDEBAR_W,
        zIndex: 41,
        background: surface,
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        borderRight: `1px solid ${border}`,
        // Right edge highlight — 1 px hairline of ambient light at the
        // far edge so the rail reads as "pane with thickness" instead
        // of a flat fill against the city.
        boxShadow: `inset -1px 0 0 ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.45)'}, 12px 0 36px rgba(0,0,0,0.08)`,
        display: 'flex', flexDirection: 'column',
        fontFamily: FONT.ui,
        color: ink,
      }}
    >
      {/* Header — VIBLOC wordmark + collapse */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 14px 12px',
        borderBottom: `1px solid ${border}`,
      }}>
        <div style={{
          fontFamily: FONT.mono,
          fontSize: 13, fontWeight: 800, letterSpacing: 1.6,
        }}>
          VIBLOC
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('tools.collapse')}
          title={t('tools.collapse')}
          style={btnIcon(ink, hover)}
        >
          <ChevronLeft size={14} strokeWidth={2.4} />
        </button>
      </div>

      {/* Body — scrollable. Settings (Lang + Dark mode) live in a
          sticky FOOTER below so they sit at the bottom of the rail
          regardless of how long the cities list is. */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '12px 10px 12px',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {/* ── Search ── */}
        {onSearchClick && (
          <RowButton
            icon={<Search size={15} strokeWidth={2.2} />}
            label={t('tools.search')}
            onClick={onSearchClick}
            ink={ink} hover={hover}
          />
        )}

        {/* ── Profile ── */}
        <Link
          to="/mypage"
          style={{
            ...rowStyle(ink),
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={iconBox()}><User size={15} strokeWidth={2.2} /></span>
          <span style={{
            flex: 1, fontSize: 13, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user?.displayName || user?.email || t('tools.profile')}
          </span>
        </Link>

        {/* ── Cities section ── */}
        <Section label={t('tools.cities')} muted={muted}>
          {(Object.keys(CITY_AREAS) as CityAreaKey[]).map((key) => {
            const selected = key === area;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectArea(key)}
                style={{
                  ...rowStyle(ink),
                  background: selected ? accent : 'transparent',
                  fontWeight: selected ? 700 : 500,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!selected) e.currentTarget.style.background = hover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = selected ? accent : 'transparent';
                }}
              >
                <span style={iconBox()}>
                  <Check size={13} strokeWidth={2.6}
                    style={{ opacity: selected ? 1 : 0 }} />
                </span>
                <span style={{ flex: 1, fontSize: 13 }}>
                  {t(`city.${key}`)}
                </span>
              </button>
            );
          })}
        </Section>

      </div>

      {/* ── Settings footer (sticky bottom) ── */}
      <div style={{
        borderTop: `1px solid ${border}`,
        padding: '12px 10px 16px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{
          fontFamily: FONT.mono,
          fontSize: 9.5, fontWeight: 800, letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: muted,
          padding: '0 10px 4px',
        }}>
          {t('tools.settings')}
        </div>

        {/* Language toggle — segmented (3 chips) */}
        <div style={{ ...rowStyle(ink), gap: 8 }}>
          <span style={iconBox()}><Globe size={15} strokeWidth={2.2} /></span>
          <div style={{
            flex: 1, display: 'inline-flex', gap: 4,
            padding: 2,
            borderRadius: 8,
            background: hover,
          }}>
            {(['en', 'ko', 'ja'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  borderRadius: 6,
                  border: 'none',
                  background: lang === l ? (darkMode ? '#2a2a35' : '#ffffff') : 'transparent',
                  color: ink,
                  fontFamily: FONT.mono,
                  fontSize: 11, fontWeight: lang === l ? 700 : 500,
                  cursor: 'pointer',
                  letterSpacing: 0.4,
                  boxShadow: lang === l ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  textTransform: 'uppercase',
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <RowButton
          icon={darkMode ? <Sun size={15} strokeWidth={2.2} /> : <Moon size={15} strokeWidth={2.2} />}
          label={darkMode ? t('tools.lightMode') : t('tools.darkMode')}
          onClick={onToggleDarkMode}
          ink={ink} hover={hover}
        />
      </div>
    </aside>
  );
}

// ─── small helpers ───────────────────────────────────────────────

function rowStyle(ink: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', borderRadius: 8,
    border: 'none', background: 'transparent',
    color: ink,
    fontFamily: FONT.ui,
    fontSize: 13,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    transition: 'background 120ms ease',
  };
}
function iconBox(): React.CSSProperties {
  return {
    width: 22, display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  };
}
function btnIcon(ink: string, hover: string): React.CSSProperties {
  return {
    width: 26, height: 26, borderRadius: 6,
    border: 'none', background: 'transparent',
    color: ink, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 120ms ease',
  };
  void hover;
}

function Section({
  label, muted, children,
}: { label: string; muted: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{
        fontFamily: FONT.mono,
        fontSize: 9.5, fontWeight: 800, letterSpacing: 1.4,
        textTransform: 'uppercase',
        color: muted,
        padding: '0 10px 6px',
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function RowButton({
  icon, label, onClick, ink, hover,
}: { icon: React.ReactNode; label: string; onClick: () => void; ink: string; hover: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={rowStyle(ink)}
      onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={iconBox()}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{label}</span>
    </button>
  );
}
