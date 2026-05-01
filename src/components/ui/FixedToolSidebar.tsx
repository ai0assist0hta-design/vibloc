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
  Check, ChevronLeft, Globe, ListMusic, Moon, Sun, User,
} from 'lucide-react';
import { useT, useI18nStore, type Lang } from '../../lib/app/i18n';
import { CITY_AREAS, type CityAreaKey, type OSMBuilding } from '../../lib/geo/osmLoader';
import { FONT, SPACE } from '../../lib/ui/tokens';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { SearchBar } from './SearchBar';
import {
  getMyBuildings, subscribePlaylists, type MyBuildingShortcut,
} from '../../lib/music/buildingPlaylist';

const SIDEBAR_W = 280;

type Props = {
  area: CityAreaKey;
  onSelectArea: (key: CityAreaKey) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  buildings: OSMBuilding[];
  onSelectBuilding: (b: OSMBuilding) => void;
  onNavigate: (position: [number, number]) => void;
};

export function FixedToolSidebar({
  area, onSelectArea, darkMode, onToggleDarkMode,
  buildings, onSelectBuilding, onNavigate,
}: Props) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(true);

  // "My playlists" shortcut list — buildings where the current user
  // has pinned at least one track. Subscribes to playlist mutations
  // so the rail updates the moment the user clicks `+` on the bar.
  const [myBuildings, setMyBuildings] = useState<MyBuildingShortcut[]>(() => getMyBuildings());
  useEffect(() => subscribePlaylists(() => setMyBuildings(getMyBuildings())), []);
  // Re-read when the user identity changes (sign-in / sign-out).
  useEffect(() => { setMyBuildings(getMyBuildings()); }, [user?.id]);

  // Resolve a buildingId to an OSMBuilding — needed because the
  // playlist store only knows ids, but `onSelectBuilding` expects
  // the full building object (so the camera can zoom + the panels
  // can hydrate). If the user is on a different city the building
  // won't be in `buildings`; skip those entries with a guard.
  function jumpToMyBuilding(buildingId: string) {
    const b = buildings.find((x) => x.id === buildingId);
    if (b) onSelectBuilding(b);
  }

  // High-contrast text + soft secondary, so even at smaller sizes
  // the rail reads cleanly against the city tiles behind the glass.
  const ink     = darkMode ? '#f5f5f7' : '#0e0e1a';
  const muted   = darkMode ? '#a8a8b3' : '#5a5a66';
  // Same translucent glass as the chasing panels — no border or edge
  // highlight, just blur. Lines were removing themselves visually
  // anyway behind the saturate boost.
  const surface = darkMode ? 'rgba(15,15,20,0.55)' : 'rgba(255,255,255,0.55)';
  const hover   = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const accent  = darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(26,26,46,0.07)';

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
        // No edges. Pure glass against the city.
        border: 'none',
        boxShadow: 'none',
        display: 'flex', flexDirection: 'column',
        fontFamily: FONT.ui,
        color: ink,
      }}
    >
      {/* Header — VIBLOC wordmark + collapse. No bottom border. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${SPACE[4]}px ${SPACE[4]}px ${SPACE[3]}px`,
      }}>
        <div style={{
          fontFamily: FONT.mono,
          fontSize: 14, fontWeight: 800, letterSpacing: 1.6,
        }}>
          VIBLOC
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('tools.collapse')}
          title={t('tools.collapse')}
          style={btnIcon(ink)}
          onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronLeft size={14} strokeWidth={2.4} />
        </button>
      </div>

      {/* Body — scrollable. Settings (Lang + Dark mode) live in a
          sticky FOOTER below so they sit at the bottom of the rail
          regardless of how long the cities list is. */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: `${SPACE[2]}px ${SPACE[3]}px ${SPACE[3]}px`,
        display: 'flex', flexDirection: 'column', gap: SPACE[4],
      }}>
        {/* ── Search section with eyebrow for clarity ── */}
        <Section label={t('tools.search')} muted={muted}>
          <div style={{ padding: `0 ${SPACE[1]}px` }}>
            <SearchBar
              embedded
              area={area}
              buildings={buildings}
              onSelectBuilding={onSelectBuilding}
              onNavigate={onNavigate}
              darkMode={darkMode}
            />
          </div>
        </Section>

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
          <span style={iconBox()}><User size={16} strokeWidth={2.2} /></span>
          <span style={{
            flex: 1, fontSize: 14, fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {user?.displayName || user?.email || t('tools.profile')}
          </span>
        </Link>

        {/* ── My playlists shortcut — buildings where the user has
            pinned tracks. Click → camera zooms + selection sets so
            the right rail re-syncs to that building's playlist. ── */}
        {myBuildings.length > 0 && (
          <Section label={t('tools.myPlaylists')} muted={muted}>
            {myBuildings.map(({ buildingId, trackCount, latestTrack }) => {
              const b = buildings.find((x) => x.id === buildingId);
              const inThisCity = !!b;
              const label = b?.name || latestTrack.trackName || buildingId;
              return (
                <button
                  key={buildingId}
                  type="button"
                  onClick={() => jumpToMyBuilding(buildingId)}
                  disabled={!inThisCity}
                  title={inThisCity ? label : t('tools.notInThisCity')}
                  style={{
                    ...rowStyle(ink),
                    cursor: inThisCity ? 'pointer' : 'not-allowed',
                    opacity: inThisCity ? 1 : 0.4,
                  }}
                  onMouseEnter={(e) => {
                    if (inThisCity) e.currentTarget.style.background = hover;
                  }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    width: 24, height: 24, flexShrink: 0,
                    borderRadius: 4, overflow: 'hidden',
                    background: darkMode ? '#2a2a35' : '#e5e5e7',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {latestTrack.artworkUrl ? (
                      <img
                        src={latestTrack.artworkUrl}
                        alt=""
                        width={24} height={24}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        referrerPolicy="no-referrer" decoding="async"
                      />
                    ) : (
                      <ListMusic size={12} strokeWidth={2.2} style={{ opacity: 0.6 }} />
                    )}
                  </span>
                  <span style={{
                    flex: 1, minWidth: 0,
                    fontSize: 14, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </span>
                  <span style={{
                    flexShrink: 0,
                    fontFamily: FONT.mono, fontSize: 11, color: muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {trackCount}
                  </span>
                </button>
              );
            })}
          </Section>
        )}

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
                  <Check size={14} strokeWidth={2.6}
                    style={{ opacity: selected ? 1 : 0 }} />
                </span>
                <span style={{ flex: 1, fontSize: 14 }}>
                  {t(`city.${key}`)}
                </span>
              </button>
            );
          })}
        </Section>

      </div>

      {/* ── Settings footer (sticky bottom) — no border, just spacing. */}
      <div style={{
        padding: `${SPACE[3]}px ${SPACE[3]}px ${SPACE[4]}px`,
        display: 'flex', flexDirection: 'column', gap: SPACE[1],
      }}>
        <div style={{
          fontFamily: FONT.mono,
          fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
          textTransform: 'uppercase',
          color: muted,
          padding: `0 ${SPACE[3]}px ${SPACE[1]}px`,
        }}>
          {t('tools.settings')}
        </div>

        {/* Language toggle — segmented (3 chips) */}
        <div style={{ ...rowStyle(ink), gap: SPACE[2] }}>
          <span style={iconBox()}><Globe size={16} strokeWidth={2.2} /></span>
          <div style={{
            flex: 1, display: 'inline-flex', gap: SPACE[1],
            padding: SPACE[1] / 2,
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
                  padding: `${SPACE[1]}px 0`,
                  borderRadius: 6,
                  border: 'none',
                  background: lang === l ? (darkMode ? '#2a2a35' : '#ffffff') : 'transparent',
                  color: ink,
                  fontFamily: FONT.mono,
                  fontSize: 12, fontWeight: lang === l ? 700 : 500,
                  cursor: 'pointer',
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <RowButton
          icon={darkMode ? <Sun size={16} strokeWidth={2.2} /> : <Moon size={16} strokeWidth={2.2} />}
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
    display: 'inline-flex', alignItems: 'center', gap: SPACE[2],
    padding: `${SPACE[2]}px ${SPACE[3]}px`, borderRadius: 8,
    border: 'none', background: 'transparent',
    color: ink,
    fontFamily: FONT.ui,
    fontSize: 14,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    transition: 'background 120ms ease',
  };
}
function iconBox(): React.CSSProperties {
  return {
    width: 24, display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  };
}
function btnIcon(ink: string): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 6,
    border: 'none', background: 'transparent',
    color: ink, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 120ms ease',
  };
}

function Section({
  label, muted, children,
}: { label: string; muted: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[1] }}>
      <div style={{
        fontFamily: FONT.mono,
        fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
        textTransform: 'uppercase',
        color: muted,
        padding: `0 ${SPACE[3]}px ${SPACE[1]}px`,
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
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{label}</span>
    </button>
  );
}
