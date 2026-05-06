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

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, Globe, ListMusic, Moon, PanelLeftClose,
  Radio, Search, Building2, Sun,
} from 'lucide-react';
import { MarqueeText } from './music/MarqueeText';
import { useT, useI18nStore, type Lang } from '../../lib/app/i18n';
import { CITY_AREAS, type CityAreaKey, type OSMBuilding } from '../../lib/geo/osmLoader';
import { FONT, SPACE } from '../../lib/ui/tokens';
import { useAuthStore } from '../../features/auth/useAuthStore';
import { SearchBar } from './SearchBar';
import {
  getMyBuildings, getTracksByTagger, subscribePlaylists, type MyBuildingShortcut,
} from '../../lib/music/buildingPlaylist';
import { playPreview, setQueue } from './music/PreviewPlayer';
import { useBuildingResolver } from '../../features/profile/useBuildingResolver';

/** Resize bounds — match FixedQueueSidebar's range so the two rails
 *  stay symmetric in capability + visual heft. Saved separately
 *  under `vibloc.toolSidebar.width` so resizing one rail doesn't
 *  drag the other. */
const SIDEBAR_DEFAULT_W = 280;
const SIDEBAR_MIN_W = 240;
const SIDEBAR_MAX_W = 560;
const SIDEBAR_W_STORAGE_KEY = 'vibloc.toolSidebar.width';

function loadWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_W;
  try {
    const v = window.localStorage.getItem(SIDEBAR_W_STORAGE_KEY);
    const n = v ? parseInt(v, 10) : NaN;
    if (Number.isFinite(n)) {
      return Math.max(SIDEBAR_MIN_W, Math.min(SIDEBAR_MAX_W, n));
    }
  } catch {
    // ignore
  }
  return SIDEBAR_DEFAULT_W;
}

type Props = {
  area: CityAreaKey;
  onSelectArea: (key: CityAreaKey) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  /** Live (real-time) mode toggle. Mirrors the Dark Mode pattern in
   *  the footer so the user can flip the scene's auto-time/weather
   *  binding from the same settings cluster. Surfaces what used to
   *  be the TimeSlider's REAL-TIME pill toggle. */
  liveMode: boolean;
  onToggleLiveMode: (next: boolean) => void;
  buildings: OSMBuilding[];
  onSelectBuilding: (b: OSMBuilding) => void;
  onNavigate: (position: [number, number]) => void;
  /** Like `onSelectBuilding` but FORCES a fresh select cycle even
   *  when the same building is already selected. Implemented in App
   *  via a brief deselect → reselect tick so camera animation +
   *  effects all re-fire on every "My Music" click. */
  onForceReselect: (b: OSMBuilding) => void;
  /** App's `setDetailTaggerId` setter — pass the current user's id
   *  to make the right rail open straight to MY PlaylistDetailView
   *  (curator profile + Play / Shuffle + my track list) instead of
   *  the building's multi-section music view. Used by the My Music
   *  shortcut so a single click = ready-to-share view. */
  onOpenMyDetail: (userId: string) => void;
};

export function FixedToolSidebar({
  area, onSelectArea, darkMode, onToggleDarkMode,
  liveMode, onToggleLiveMode,
  buildings, onSelectBuilding, onNavigate, onForceReselect,
  onOpenMyDetail,
}: Props) {
  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(true);
  // Apple Music sidebar: only one section expanded at a time.
  // `null` = everything collapsed (just the topic list visible).
  type SectionKey = 'search' | 'mymusic' | 'cities';
  const [expanded, setExpanded] = useState<SectionKey | null>(null);
  const toggle = (k: SectionKey) => setExpanded((prev) => (prev === k ? null : k));

  // ── Drag-to-resize (mirror of FixedQueueSidebar) ───────────────
  // Handle lives on the LEFT rail's RIGHT edge (the "inside" edge).
  // Drag right → wider, drag left → narrower. Persisted under a
  // separate storage key so the two rails resize independently.
  const [width, setWidth] = useState<number>(loadWidth);
  const widthRef = useRef(width);
  widthRef.current = width;
  const draggingRef = useRef(false);

  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const moveTo = (clientX: number) => {
      // Left-anchored sidebar: as the cursor moves RIGHT, the
      // sidebar grows. Cap to MAX_W and to ~50 % of viewport so
      // the rail never eats the whole map.
      const maxAllowed = Math.min(SIDEBAR_MAX_W, Math.floor(window.innerWidth * 0.5));
      const next = Math.max(SIDEBAR_MIN_W, Math.min(maxAllowed, clientX));
      setWidth(next);
    };
    const onMove = (ev: MouseEvent) => { if (draggingRef.current) moveTo(ev.clientX); };
    const onTouchMove = (ev: TouchEvent) => {
      if (!draggingRef.current) return;
      const tch = ev.touches[0];
      if (tch) moveTo(tch.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        window.localStorage.setItem(SIDEBAR_W_STORAGE_KEY, String(widthRef.current));
      } catch { /* ignore */ }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
  }, []);

  const resetWidth = useCallback(() => {
    setWidth(SIDEBAR_DEFAULT_W);
    try {
      window.localStorage.setItem(SIDEBAR_W_STORAGE_KEY, String(SIDEBAR_DEFAULT_W));
    } catch { /* ignore */ }
  }, []);

  // "My playlists" shortcut list — buildings where the current user
  // has pinned at least one track. Subscribes to playlist mutations
  // so the rail updates the moment the user clicks `+` on the bar.
  const [myBuildings, setMyBuildings] = useState<MyBuildingShortcut[]>(() => getMyBuildings());
  useEffect(() => subscribePlaylists(() => setMyBuildings(getMyBuildings())), []);
  // Re-read when the user identity changes (sign-in / sign-out).
  useEffect(() => { setMyBuildings(getMyBuildings()); }, [user?.id]);

  // Cross-city building resolver — lets a My Music click jump to a
  // building that's NOT in the currently-loaded area by first
  // switching to the right city and then completing the selection
  // once the new area's buildings stream in.
  const resolver = useBuildingResolver();
  const [pendingShortcut, setPendingShortcut] = useState<MyBuildingShortcut | null>(null);

  // Once an area switch lands and the target building appears in the
  // freshly-loaded `buildings`, finish the My Music flow: force-
  // reselect + queue + play. Same body as the same-city path below;
  // factored here so the post-switch hand-off runs identically.
  useEffect(() => {
    if (!pendingShortcut) return;
    const b = buildings.find((x) => x.id === pendingShortcut.buildingId);
    if (!b) return;
    runMyBuildingJump(pendingShortcut, b);
    setPendingShortcut(null);
    // intentionally exclude runMyBuildingJump (stable closure) —
    // we only want to re-fire when buildings list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings, pendingShortcut]);

  // "My Music" click → camera zooms to the building AND auto-plays
  // the user's own latest pinned track in that building, with the
  // FULL set of user's pinned tracks loaded as the queue (so prev /
  // next walks YOUR tracks, not the building's #1 playlist).
  //
  // Why we drive playback here directly (instead of relying on the
  // App-level auto-play effect): that effect uses the building's #1
  // playlist as the queue — it would clobber our user-track queue.
  // We pre-set a sentinel via setQueue(...) and call playPreview
  // synchronously so the user-tracks queue is already in place by
  // the time the App effect's 250 ms timer fires; the App effect's
  // dedup guard then skips because the active track id matches.
  function runMyBuildingJump(shortcut: MyBuildingShortcut, b: OSMBuilding) {
    // Force a fresh selection cycle — even if the user is already on
    // this building, we want the camera animation + auto-play guards
    // to re-fire as if it were a brand-new selection. App's handler
    // does a deselect→reselect dance to make that happen.
    onForceReselect(b);

    const me = user?.id;
    if (!me) return;
    const myTracks = getTracksByTagger(shortcut.buildingId, me);
    if (myTracks.length === 0) return;
    const queue = myTracks.map((tr) => ({
      id: tr.id,
      url: tr.previewUrl,
      meta: {
        title: tr.trackName,
        artist: tr.artistName,
        artworkUrl: tr.artworkUrl || undefined,
        appleUrl: tr.trackViewUrl || undefined,
        genre: tr.genre,
      },
    }));
    const first = queue[0];
    // Run our queue + play AFTER the force-reselect's microtask so
    // the App auto-play effect (which fires 250 ms post-selection)
    // finds our queue already in place and skips via the snapshot
    // guard (currentBuildingId === id + queue.length > 0).
    window.setTimeout(() => {
      setQueue(queue, shortcut.buildingId);
      playPreview(first.id, first.url, first.meta, { force: true });
      onOpenMyDetail(me);
    }, 0);
  }

  /** My Music click handler — works regardless of which city the
   *  building lives in. If it's already in the loaded area, runs
   *  the play hand-off immediately. If it's in a DIFFERENT city,
   *  flips the area first and stashes the shortcut so the
   *  pendingShortcut effect can finish the hand-off the moment the
   *  new area's buildings stream in. */
  function jumpToMyBuilding(shortcut: MyBuildingShortcut) {
    const b = buildings.find((x) => x.id === shortcut.buildingId);
    if (b) {
      runMyBuildingJump(shortcut, b);
      return;
    }
    // Building lives in another city — resolve its cityKey and switch
    // the area. The pendingShortcut effect picks up after the area's
    // buildings list updates.
    const info = resolver.info(shortcut.buildingId);
    if (info && info.cityKey !== area) {
      setPendingShortcut(shortcut);
      onSelectArea(info.cityKey);
      return;
    }
    // Resolver hasn't finished hydrating yet — stash anyway so the
    // effect catches it once buildings/resolver settle.
    setPendingShortcut(shortcut);
  }

  // High-contrast text + soft secondary, so even at smaller sizes
  // the rail reads cleanly against the city tiles behind the glass.
  const ink     = darkMode ? '#f5f5f7' : '#0e0e1a';
  const muted   = darkMode ? '#a8a8b3' : '#5a5a66';
  // Translucent glass surface — alpha fades aggressively as the
  // user drags the rail wider:
  //   • Default 280 px → 0.40 alpha
  //   • Max 560 px     → 0.02 alpha (effectively just blur, no fill)
  // The 24-px backdrop blur keeps text legible against the city
  // even at 0.02 alpha — the city softens enough to read text on top.
  const fadeT = Math.max(0, Math.min(1,
    (width - SIDEBAR_DEFAULT_W) / (SIDEBAR_MAX_W - SIDEBAR_DEFAULT_W)));
  const surfaceAlpha = 0.40 - fadeT * 0.38;
  const surface = darkMode
    ? `rgba(15,15,20,${surfaceAlpha})`
    : `rgba(255,255,255,${surfaceAlpha})`;
  const hover   = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const accent  = darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(14,14,26,0.07)';

  // Sync collapse state into a body attribute so other fixed surfaces
  // (NowPlayingBar, FixedQueueSidebar) can adjust their margins
  // without prop-drilling. Picked up by index.css selectors.
  useEffect(() => {
    document.body.dataset.tools = open ? 'open' : 'closed';
    return () => { delete document.body.dataset.tools; };
  }, [open]);

  // ── Live width broadcast ─────────────────────────────────────
  // Publishes the rail's current effective width as a CSS custom
  // property on :root so any other surface (NowPlayingBar, floating
  // panels) can react via `calc(var(--vbk-left-rail-w))`. Tracks
  // both resize drag AND open/close — collapsed rail's effective
  // width is the 28-px thin tab handle.
  useEffect(() => {
    const effective = open ? width : 28;
    document.documentElement.style.setProperty('--vbk-left-rail-w', `${effective}px`);
    return () => {
      document.documentElement.style.removeProperty('--vbk-left-rail-w');
    };
  }, [open, width]);

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
          zIndex: 40,
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
        width: width,
        // Unified hovering-panel z-stack: rails 40 / NowPlayingBar 50.
        // Was 41 — broke parity with the right rail (40).
        zIndex: 40,
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
      {/* Resize handle — mirrors FixedQueueSidebar's left-edge
          handle, lives on this rail's RIGHT (inside) edge. 6 px hit
          area + 1 px visual marker. Double-click → reset to 280. */}
      <div
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        onDoubleClick={resetWidth}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize tool sidebar"
        aria-valuemin={SIDEBAR_MIN_W}
        aria-valuemax={SIDEBAR_MAX_W}
        aria-valuenow={width}
        style={{
          position: 'absolute',
          right: -3, top: 0, bottom: 0,
          width: 6,
          cursor: 'col-resize',
          background: 'transparent',
          zIndex: 41,
          touchAction: 'none',
        }}
        onMouseEnter={(e) => {
          const marker = e.currentTarget.firstElementChild as HTMLElement | null;
          if (marker) marker.style.background = darkMode ? '#3da4ff' : '#2997ff';
        }}
        onMouseLeave={(e) => {
          const marker = e.currentTarget.firstElementChild as HTMLElement | null;
          if (marker) marker.style.background = darkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)';
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 2, top: '50%',
            transform: 'translateY(-50%)',
            width: 2,
            height: 36,
            borderRadius: 2,
            background: darkMode ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)',
            transition: 'background 160ms ease, height 160ms ease',
            pointerEvents: 'none',
          }}
        />
      </div>
      {/* Header — minimal: collapse only, mirroring FixedQueueSidebar.
          The VIBLOC wordmark moved to the global MarketingHeader to
          balance the left and right rails (no-text-on-left vs no-
          text-on-right asymmetry). Apple Music macOS sidebars
          similarly omit a top-of-rail brand mark. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        // Unified header padding across all hovering panels:
        // top 12 / horizontal 16 / bottom 12. Visually matches
        // FixedQueueSidebar + NowPlayingBar so all three rails
        // present the same chrome thickness.
        padding: `${SPACE[3]}px ${SPACE[4]}px ${SPACE[3]}px`,
      }}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('tools.collapse')}
          title={t('tools.collapse')}
          style={btnIcon(muted)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = hover;
            e.currentTarget.style.color = ink;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = muted;
          }}
        >
          {/* PanelLeftClose — semantic "collapse this side panel"
              icon (Apple Finder / VS Code sidebar pattern). Reads
              as a panel toggle, not a generic back-arrow. Sits in
              muted color so it doesn't compete with the VIBLOC
              wordmark on the same row. */}
          <PanelLeftClose size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Body — Apple-Music-macOS sidebar pattern: a flat list of
          topic rows. Clicking a row toggles its content directly
          below via a max-height slide. Only one section expanded at
          a time (Apple's "single-disclosure" convention).

          Topic list (no inline content until clicked):
            • Search                  → SearchBar
            • My Music (LIBRARY)      → pinned-buildings shortcuts
            • Cities                  → 6-city radio list
            • Settings                → Lang segmented + Dark toggle

          Profile row was MOVED to the top of FixedQueueSidebar per
          design pass — keeps the left rail purely navigational. */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: `${SPACE[2]}px 0 ${SPACE[3]}px`,
        display: 'flex', flexDirection: 'column',
        // 2 px gap between sibling rows (TopicRow ↔ TopicRow,
        // Disclosure ↔ TopicRow). Apple Music macOS sidebar uses
        // exactly this micro-rhythm so adjacent topics breathe
        // without visually breaking the list.
        gap: 2,
      }}>
        {/* Top group — no eyebrow (Apple Music's "Search/Home/New/
            Radio" group). Each row is a single-line topic; click
            opens its disclosure body. */}
        <TopicRow
          icon={<Search size={16} strokeWidth={2.2} />}
          label={t('tools.search')}
          isOpen={expanded === 'search'}
          onClick={() => toggle('search')}
          ink={ink} muted={muted} hover={hover} accent={accent}
        />
        {expanded === 'search' && (
          <Disclosure>
            {/* Horizontal padding 12 (= TopicRow's outer margin) so
                the search input spans the EXACT same left/right edges
                as the parent "Search" topic row above it. The
                previous 24-px left indent was the generic nested-row
                indent; for a single-input panel that left the input
                visibly narrower than the row that opened it. */}
            <div style={{ padding: `${SPACE[1]}px ${SPACE[3]}px ${SPACE[2]}px ${SPACE[3]}px` }}>
              <SearchBar
                embedded
                area={area}
                buildings={buildings}
                onSelectBuilding={onSelectBuilding}
                onNavigate={onNavigate}
                darkMode={darkMode}
              />
            </div>
          </Disclosure>
        )}

        <TopicRow
          icon={<Building2 size={16} strokeWidth={2.2} />}
          label={t('tools.cities')}
          isOpen={expanded === 'cities'}
          onClick={() => toggle('cities')}
          ink={ink} muted={muted} hover={hover} accent={accent}
        />
        {expanded === 'cities' && (
          <Disclosure>
            {(Object.keys(CITY_AREAS) as CityAreaKey[]).map((key) => {
              const selected = key === area;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectArea(key)}
                  aria-pressed={selected}
                  style={{
                    ...nestedRowStyle(ink),
                    background: selected ? accent : 'transparent',
                    fontWeight: selected ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) e.currentTarget.style.background = hover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = selected ? accent : 'transparent';
                  }}
                >
                  <span style={iconBox()} aria-hidden="true">
                    {selected ? (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: ink,
                      }} />
                    ) : null}
                  </span>
                  <span style={{ flex: 1 }}>{t(`city.${key}`)}</span>
                </button>
              );
            })}
          </Disclosure>
        )}

        {/* LIBRARY eyebrow removed — the rail now reads as a single
            flat list of topics; the section label was a visual
            divider that didn't add categorisation value with only
            one item under it. */}

        <TopicRow
          icon={<ListMusic size={16} strokeWidth={2.2} />}
          label={t('tools.myPlaylists')}
          rightBadge={myBuildings.length > 0 ? String(myBuildings.length) : undefined}
          isOpen={expanded === 'mymusic'}
          onClick={() => toggle('mymusic')}
          ink={ink} muted={muted} hover={hover} accent={accent}
        />
        {expanded === 'mymusic' && (
          <Disclosure>
            {myBuildings.length === 0 ? (
              <div style={{
                ...myMusicChildRowStyle(muted),
                cursor: 'default',
              }}>
                {t('tools.notInThisCity')}
              </div>
            ) : (
              myBuildings.map((shortcut) => {
                const { buildingId, trackCount, latestTrack } = shortcut;
                // Prefer the resolver's cross-city name lookup so a
                // building that lives in a different city still
                // shows its real label (the local `buildings` array
                // only contains the active area's buildings).
                const localB = buildings.find((x) => x.id === buildingId);
                const resolvedName = resolver.name(buildingId);
                const label = localB?.name || resolvedName || latestTrack.trackName || buildingId;
                return (
                  <button
                    key={buildingId}
                    type="button"
                    onClick={() => jumpToMyBuilding(shortcut)}
                    title={label}
                    className="vbk-card-mq"
                    style={{
                      ...myMusicChildRowStyle(ink),
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* No leading icon — list reads as a clean indented
                        text list per design pass. The shrink to 11 px
                        font also makes a leading 14 px glyph feel
                        oversized; dropping it tightens the column. */}
                    <MarqueeText
                      text={label}
                      title={label}
                      disableClick
                      style={{
                        flex: 1, minWidth: 0,
                        fontSize: 12,
                        fontWeight: 400,
                        color: ink,
                        letterSpacing: '-0.01em',
                      }}
                    />
                    {/* Track count column — width-locked to 16 px and
                        sitting at the right edge with the same 12 px
                        right padding as the parent topic row, so the
                        badge "8" on the parent and every child count
                        end on a single straight column. */}
                    <span style={{
                      width: 16,
                      flexShrink: 0,
                      fontSize: 12,
                      color: muted,
                      fontVariantNumeric: 'tabular-nums',
                      textAlign: 'right',
                    }}>
                      {trackCount}
                    </span>
                  </button>
                );
              })
            )}
          </Disclosure>
        )}

      </div>

      {/* ── Sticky settings footer — Language + Live + Dark mode.
          Stays anchored to the rail's bottom edge regardless of how
          tall the body grows ( body has flex:1 + overflow auto, so
          this footer is naturally pushed down ). The translucent
          fill makes the city behind the rail bleed through the
          settings cluster — same glass vocabulary as NowPlayingBar.

          Apple HIG settings group spec:
            • 1 px hairline above so the cluster reads as panel chrome
            • 8 px gap between rows
            • 12 px top / 16 px bottom padding lifts the toggle off
              the rail's floor edge
            • frosted glass: rgba 0.55 + 24 px blur + 160 % saturate */}
      <div style={{
        // Footer flows seamlessly into the body — no surface change,
        // no hairline divider. Footer/body are read as one continuous
        // panel; the spacing alone marks the section break.
        display: 'flex', flexDirection: 'column',
        flexShrink: 0,
        gap: SPACE[2],
        padding: `${SPACE[3]}px 0 ${SPACE[4]}px`,
        background: 'transparent',
      }}>
        {/* Footer order — Live → Dark → Language. Live + Dark are
            the two reactive system controls (often toggled), so
            they sit on top where the eye lands; Language is a
            "set once" preference and reads as a quieter base row. */}
        <ToggleRow
          icon={<Radio size={14} strokeWidth={2.2} />}
          label={t('tools.liveMode')}
          on={liveMode}
          onToggle={() => onToggleLiveMode(!liveMode)}
          ink={ink} hover={hover}
        />

        <ToggleRow
          icon={darkMode
            ? <Sun  size={14} strokeWidth={2.2} />
            : <Moon size={14} strokeWidth={2.2} />}
          label={t('tools.darkMode')}
          on={darkMode}
          onToggle={onToggleDarkMode}
          ink={ink} hover={hover}
          ariaLabel={darkMode ? t('tools.lightMode') : t('tools.darkMode')}
        />

        <div style={{
          ...nestedRowStyle(ink),
          paddingLeft: SPACE[3],
          paddingTop: SPACE[2], paddingBottom: SPACE[2],
          minHeight: 32,
          gap: SPACE[2],
          cursor: 'default',
        }}>
          <span style={iconBox()}><Globe size={14} strokeWidth={2.2} /></span>
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
                  fontSize: 12, fontWeight: lang === l ? 600 : 500,
                  cursor: 'pointer',
                  letterSpacing: 0,
                  textTransform: 'uppercase',
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── small helpers ───────────────────────────────────────────────

/** Left icon column — locked to 24×24 so every row's leading visual
 *  (User glyph, Globe, ListMusic, album artwork) sits in the SAME
 *  square. Profile icon was previously height-less, which made the
 *  glyph look smaller than the My Playlists album thumbnails directly
 *  beneath it. Now they all share one footprint. */
function iconBox(): React.CSSProperties {
  return {
    width: 24, height: 24, display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  };
}
/** Trailing fixed-width slot — chevron / count / etc. all sit in the
 *  same right-aligned 24-px column so the rail's right edge reads as
 *  one straight line instead of a jagged column. */
function endSlot(): React.CSSProperties {
  return {
    width: 24, flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end',
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

// SectionEyebrow helper removed along with the LIBRARY label — the
// rail no longer has categorised sections, just a flat topic list.
// Re-add when (if) a second category is introduced.

/** Settings ON/OFF row — shared spec for Live mode + Dark mode in
 *  the footer. icon (14) + label (12/400) + 32 × 18 pill switch.
 *  Click anywhere on the row to toggle (hit-target is the full
 *  width). When `on`, the switch's track lifts to a brighter fill
 *  and the thumb slides to the right. */
function ToggleRow({
  icon, label, on, onToggle, ink, hover, ariaLabel,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onToggle: () => void;
  ink: string;
  hover: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={ariaLabel ?? label}
      style={{
        ...nestedRowStyle(ink),
        paddingLeft: SPACE[3],
        paddingTop: SPACE[2], paddingBottom: SPACE[2],
        minHeight: 32,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={iconBox()}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          width: 32, height: 18, borderRadius: 999,
          background: on
            ? '#34c759'
            : 'rgba(0,0,0,0.12)',
          transition: 'background 120ms ease',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2, left: on ? 16 : 2,
            width: 14, height: 14, borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.16)',
            transition: 'left 120ms ease',
          }}
        />
      </span>
    </button>
  );
}

/** Apple Music macOS top-level topic row.
 *  Spec: 32 px hit area, 16 px icon, 12 px gap, 13 pt label, 8 px
 *  inner radius, 8 px horizontal padding inside the rail's 12 px
 *  outer gutter. Click toggles its disclosure body — chevron flips
 *  90° to indicate state (Apple Finder / Music sidebar pattern). */
function TopicRow({
  icon, label, rightBadge, isOpen, onClick,
  ink, muted, hover, accent,
}: {
  icon: React.ReactNode;
  label: string;
  rightBadge?: string;
  isOpen: boolean;
  onClick: () => void;
  ink: string;
  muted: string;
  hover: string;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      className="vbk-card-mq"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        margin: `0 ${SPACE[3]}px`,
        padding: `${SPACE[2]}px ${SPACE[3]}px`,
        borderRadius: 8,
        border: 'none',
        background: isOpen ? accent : 'transparent',
        color: ink,
        fontFamily: FONT.ui,
        // 12 / 500-600 — Apple Music macOS sidebar item spec.
        // Was 16/600 (open), too heavy + too large compared to the
        // body text below. Smaller-but-bolder reads as a navigation
        // label rather than a section heading.
        fontSize: 12,
        fontWeight: isOpen ? 600 : 500,
        letterSpacing: '-0.01em',
        cursor: 'pointer',
        textAlign: 'left',
        boxSizing: 'border-box',
        minWidth: 0,
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!isOpen) e.currentTarget.style.background = hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isOpen ? accent : 'transparent';
      }}
    >
      <span style={iconBox()}>{icon}</span>
      {/* MarqueeText flows on hover when label overflows — same
          marquee vocabulary as the playlist cards on MyPage. */}
      <MarqueeText
        text={label}
        title={label}
        disableClick
        style={{
          // Same 12 / 500-600 spec as the parent button — keeps the
          // marquee text in the same type tier as the surrounding
          // sidebar labels.
          flex: 1, minWidth: 0,
          fontSize: 12,
          fontWeight: isOpen ? 600 : 500,
          color: ink,
          letterSpacing: '-0.01em',
        }}
      />
      {rightBadge ? (
        <span style={{
          width: 16,
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 500,
          color: muted,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
        }}>
          {rightBadge}
        </span>
      ) : null}
      {/* Disclosure indicator removed per design pass — the row
          itself reads as a topic; the open-state highlight (accent
          fill + bold weight) signals expansion without an extra
          symbol. Eliminates the right-edge stack-up where the badge
          and the indicator were too close. */}
    </button>
  );
}

/** Slide-down disclosure container. CSS keyframe `vibloc-fade-in`
 *  is already defined in index.css (slight Y-translate + opacity).
 *
 *  Spacing spec (Apple HIG nested list rhythm):
 *    • 6 px gap between TopicRow and the first child  (paddingTop)
 *    • 2 px gap between children                       (gap)
 *    • 10 px gap before the next section               (paddingBottom)
 *  Previously the children were stacked with 0 gap and only 4 px
 *  top padding — visually fused into one block. The new rhythm
 *  matches Apple Music macOS where nested rows breathe but stay
 *  obviously grouped. */
function Disclosure({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        animation: 'vibloc-fade-in 160ms cubic-bezier(0.22, 1, 0.36, 1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: `${SPACE[2]}px 0 ${SPACE[3]}px`,
      }}
    >
      {children}
    </div>
  );
}

/** Specialized child row for the My Music disclosure. Smaller than
 *  generic nested rows: shorter (24 min-h vs 28), 11 px text, no
 *  leading icon column, and the right-hand numeric column is locked
 *  to the SAME axis as the parent topic row's badge so every digit
 *  on the My Music section reads as one straight column. */
function myMusicChildRowStyle(ink: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8,
    // Indent matches the parent TopicRow's icon column (24) + gap
    // (12) + outer margin (12) = ~48 px — visually nests "below" the
    // My Music row's label start.
    margin: `0 ${SPACE[3]}px`,
    padding: `${SPACE[1]}px ${SPACE[3]}px ${SPACE[1]}px ${SPACE[8]}px`,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: ink,
    fontFamily: FONT.ui,
    fontSize: 12,
    fontWeight: 400,
    letterSpacing: '-0.01em',
    cursor: 'pointer',
    boxSizing: 'border-box',
    textAlign: 'left',
    minHeight: 24,
    minWidth: 0,
    overflow: 'hidden',
    transition: 'background 120ms ease',
  };
}

/** Indented child row inside a Disclosure. Lighter weight, smaller
 *  font, leading 24-px icon column aligned with the parent topic
 *  icon (so "Cities → Shinjuku" tree reads cleanly).
 *
 *  Uses block-level `flex` (not `inline-flex`) so the row fills the
 *  parent's content width edge-to-edge minus its horizontal margin.
 *  The previous `inline-flex` allowed long labels (e.g. building
 *  names from `My Music`) to overflow past the topic row's right
 *  edge — fixed by switching display + adding `boxSizing` so the
 *  margin is honored regardless of padding. */
function nestedRowStyle(ink: string): React.CSSProperties {
  return {
    // gap 12 + paddingLeft 12 — geometrically identical to the
    // parent TopicRow (margin 12 / padding 12 / gap 12). With the
    // shared margin 12 + paddingLeft 12, the iconBox sits between
    // rail-x 24 and 48, putting its 6-px bullet center at rail-x=36
    // — exactly where the parent's Building2 / ListMusic / Search
    // glyph centers. The label that follows starts at rail-x=60,
    // matching the parent label column too.
    //
    // (Was SPACE[5], which doesn't exist on the SPACE token —
    // resolved to `undefinedpx` so paddingLeft was effectively 0
    // and bullets fell outside the icon column.)
    display: 'flex', alignItems: 'center', gap: SPACE[3],
    margin: `0 ${SPACE[3]}px`,
    padding: `${SPACE[1]}px ${SPACE[3]}px ${SPACE[1]}px ${SPACE[3]}px`,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: ink,
    fontFamily: FONT.ui,
    fontSize: 12,
    fontWeight: 400,
    letterSpacing: '-0.01em',
    cursor: 'pointer',
    boxSizing: 'border-box',
    textAlign: 'left',
    minHeight: 28,
    minWidth: 0,
    overflow: 'hidden',
    transition: 'background 120ms ease',
  };
}

