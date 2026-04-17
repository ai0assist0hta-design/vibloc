import { useState, useCallback, useRef, useEffect } from 'react';
import { PlateauScene, type NavTarget, type BuildingScreenAnchor } from './components/canvas/PlateauScene';
import { SearchBar } from './components/ui/SearchBar';
import { Compass } from './components/ui/Compass';
import { TimeSlider } from './components/ui/TimeSlider';
import { LanguageToggle } from './components/ui/LanguageToggle';
import { CanvasTour } from './components/ui/CanvasTour';
import { LocalePrompt } from './components/ui/LocalePrompt';
import { useT, translateTagLabel, useI18nStore } from './lib/app/i18n';
import { CITY_AREAS, type CityAreaKey, type OSMBuilding, type OSMRoad, type BuildingTag, metersToLatLon, reverseGeocode, fetchOSMTerrain } from './lib/geo/osmLoader';
import {
  googleMapsLink,
  appleMapsLink,
  bingMapsLink,
  naverMapLink,
  kakaoMapLink,
  yahooJapanMapLink,
} from './lib/geo/plusCode';
import { StreetViewBox } from './components/ui/StreetViewBox';
import { RecommendedList } from './components/ui/music/RecommendedList';
import { BuildingPlaylist } from './components/ui/music/BuildingPlaylist';
import { AddTrackComposer } from './components/ui/music/AddTrackComposer';
import { TopTaggerCard } from './components/ui/music/TopTaggerCard';
import { PopularTrackCard } from './components/ui/music/PopularTrackCard';
import { PlaylistDetailView } from './components/ui/music/PlaylistDetailView';
import { CityVibeBlock } from './components/ui/music/CityVibeBlock';
import { getCityVibe } from './lib/music/cityProfile';
import { getTenantLogoUrl, CATEGORY_GLYPH } from './lib/geo/tenantLogo';
import { pickOutsideViewpoint, snapToNearestRoad } from './lib/streetview/streetViewViewpoint';
import { loadAppleGenreColors } from './lib/music/genreColorSource';
import { useArtworkTint } from './lib/music/headerTint';
import { usePlaylist } from './lib/music/buildingPlaylist';
import { STATIC_GENRE_COLORS } from './data/genres';
import { useWeatherStore } from './stores/useWeatherStore';
import { useAuthStore } from './features/auth/useAuthStore';
import { UserAvatar } from './features/auth/UserAvatar';

/**
 * Country code per city area — used to pick locale-appropriate map deeplinks.
 * Kept as a flat lookup so the panel renders zero-cost fallback links for the
 * map app the user actually has installed (Naver/Kakao for KR, Yahoo for JP).
 */
const AREA_COUNTRY: Record<string, 'JP' | 'KR' | 'US'> = {
  shinjuku: 'JP',
  shibuya: 'JP',
  itaewon: 'KR',
  gangnam: 'KR',
  manhattan: 'US',
  la: 'US',
};
import './index.css';

/**
 * Country-specific deeplinks collapsed under a "더보기 / more" toggle.
 *
 * NN/g Disclosure pattern: keeps the primary actions (Google + Apple) always
 * visible while moving locale-specific apps one tap away. Lower visual noise
 * for the 99% case where the user just wants Google/Apple, no loss of
 * functionality for the locals who actually use 네이버/카카오/Yahoo!地図/Bing.
 */
function LocaleDeeplinks({
  urls,
  ghostBtn,
  lang,
}: {
  urls: { label: string; href: string }[];
  ghostBtn: React.CSSProperties;
  lang: 'ko' | 'ja' | 'en';
}) {
  const [open, setOpen] = useState(false);
  if (urls.length === 0) return null;
  const moreLabel = lang === 'ko' ? '더보기' : lang === 'ja' ? 'もっと見る' : 'more';
  const lessLabel = lang === 'ko' ? '접기' : lang === 'ja' ? '閉じる' : 'less';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ ...ghostBtn, cursor: 'pointer' }}
      >
        {open ? `${lessLabel} ▴` : `${moreLabel} ▾`}
      </button>
      {open &&
        urls.map((u) => (
          <a key={u.label} href={u.href} target="_blank" rel="noopener noreferrer" style={ghostBtn}>
            {u.label} ↗
          </a>
        ))}
    </>
  );
}

function App() {
  // Toggle overflow:hidden on body so the map canvas fills the viewport
  // while other pages (landing, auth, mypage) can scroll normally.
  useEffect(() => {
    document.body.classList.add('map-active');
    return () => document.body.classList.remove('map-active');
  }, []);

  const t = useT();
  const lang = useI18nStore((s) => s.lang);
  const [area, setArea] = useState<CityAreaKey>('shinjuku');
  // Navigation target: world (x, z) plus optional height and footprint.
  // The footprint lets CameraNavigator orient the fly-to along the building's
  // actual long axis (OBB), so long Manhattan slabs and rotated towers get a
  // proper 3/4 view instead of an edge-on shot from a hard-coded SE diagonal.
  const [navigateTarget, setNavigateTarget] = useState<NavTarget | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [liveTimeEnabled, setLiveTimeEnabled] = useState(false);
  const [sunLightPos, setSunLightPos] = useState<[number, number, number] | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<OSMBuilding | null>(null);
  // Coordinate sanitized by StreetViewBox's OSM-station Overpass query.
  // When the building's raw entry coord is within ~40 m of a subway /
  // station entrance, this gets shifted ~70 m away in the bearing
  // facing the building, so the Google/Apple Maps deeplinks below
  // open above ground instead of on top of the subway exit.
  const [sanitizedCoord, setSanitizedCoord] = useState<{ lat: number; lon: number } | null>(null);
  // Currently expanded tag chip in the panel — null = nothing open. Reset
  // automatically when the user picks a different building.
  const [expandedTagKey, setExpandedTagKey] = useState<string | null>(null);
  useEffect(() => { setExpandedTagKey(null); }, [selectedBuilding?.id]);
  // Detail-view state: when set, the right panel body shows a single
  // tagger's playlist instead of the default building sections.
  const [detailTaggerId, setDetailTaggerId] = useState<string | null>(null);
  useEffect(() => { setDetailTaggerId(null); }, [selectedBuilding?.id]);
  // Live screen-space anchor for the selected building. Updated each
  // frame from inside Canvas (BuildingScreenProjector). Used to float
  // the left panel next to the building without overlapping it.
  const [bldgAnchor, setBldgAnchor] = useState<BuildingScreenAnchor | null>(null);
  useEffect(() => { if (!selectedBuilding) setBldgAnchor(null); }, [selectedBuilding]);

  // ── Smooth panel motion (rAF lerp toward target) ──
  // CSS transitions stutter when the target updates every frame
  // because each update restarts the easing curve. Instead we keep a
  // mutable `target` (recomputed when anchor/viewport changes) and a
  // mutable `current` that chases the target with critical damping
  // each frame, writing directly to the DOM via ref. This avoids both
  // React re-renders AND the "always re-easing" stutter, producing a
  // smooth, perceptually-natural follow.
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const panelTargetRef = useRef<{ left: number; top: number } | null>(null);
  const panelCurrentRef = useRef<{ left: number; top: number } | null>(null);

  // Recompute the target whenever the anchor or window size changes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const PANEL_W = 280;
    const PANEL_GAP = 28;
    const PANEL_VIEWPORT_INSET = 16;
    const PANEL_HEADER_INSET = 88;
    function computeTarget(): { left: number; top: number } {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!bldgAnchor || !bldgAnchor.inFront) {
        return { left: 360, top: vh * 0.38 };
      }
      const halfW = Math.max(40, bldgAnchor.radius);
      let lx = bldgAnchor.x - halfW - PANEL_GAP - PANEL_W;
      if (lx < PANEL_VIEWPORT_INSET) {
        lx = bldgAnchor.x + halfW + PANEL_GAP;
        if (lx + PANEL_W > vw - PANEL_VIEWPORT_INSET) {
          lx = vw - PANEL_W - PANEL_VIEWPORT_INSET;
        }
      }
      let ty = bldgAnchor.y - 24;
      if (ty < PANEL_HEADER_INSET) ty = PANEL_HEADER_INSET;
      if (ty > vh - 220) ty = vh - 220;
      return { left: lx, top: ty };
    }
    const t = computeTarget();
    panelTargetRef.current = t;
    if (panelCurrentRef.current === null) {
      // First-time placement: snap so the panel doesn't visibly fly in.
      panelCurrentRef.current = { ...t };
      if (leftPanelRef.current) {
        leftPanelRef.current.style.left = `${t.left}px`;
        leftPanelRef.current.style.top = `${t.top}px`;
      }
    }
    function onResize() {
      panelTargetRef.current = computeTarget();
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bldgAnchor]);

  // rAF chase loop — runs continuously while a panel is mounted.
  // Uses a frame-rate-independent exponential smoother so motion feels
  // identical at 60 / 120 / 144 Hz: with halfLifeMs = 110, the panel
  // covers half the remaining distance to the target every ~110 ms,
  // creating a critically-damped slide that settles within ~3 frames
  // of the camera coming to rest.
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const HALF_LIFE_MS = 110;
    function step(now: number) {
      const dt = Math.max(1, now - prev);
      prev = now;
      const t = panelTargetRef.current;
      const c = panelCurrentRef.current;
      if (t && c && leftPanelRef.current) {
        // Frame-rate-independent lerp: alpha = 1 - 0.5^(dt/halfLife)
        const alpha = 1 - Math.pow(0.5, dt / HALF_LIFE_MS);
        c.left += (t.left - c.left) * alpha;
        c.top += (t.top - c.top) * alpha;
        // Snap when within sub-pixel distance to avoid jittering.
        if (Math.abs(t.left - c.left) < 0.25) c.left = t.left;
        if (Math.abs(t.top  - c.top)  < 0.25) c.top  = t.top;
        leftPanelRef.current.style.left = `${c.left}px`;
        leftPanelRef.current.style.top = `${c.top}px`;
      }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Apple Look Around convention (Apple HIG, 2026): immersive
  // imagery is shown on-demand, never embedded above the fold. The
  // Street View block stays collapsed to a small thumbnail button
  // and only mounts the iframe once the user explicitly opts in,
  // reclaiming ~260px of vertical space for the actual tagging flow.
  const [streetViewExpanded, setStreetViewExpanded] = useState(false);
  useEffect(() => { setStreetViewExpanded(false); }, [selectedBuilding?.id]);
  // Apple Music iOS 26.4 paired-color header tint (#10): read the
  // top pinned track's artwork and derive a complementary wash for
  // the panel header. Hooks must run unconditionally, so we always
  // call them with a safe fallback id and let the result be null
  // when no building/track is active.
  const _playlistForTint = usePlaylist(selectedBuilding?.id ?? '__no_building__');
  const _topPinnedArtwork = _playlistForTint.tracks[0]?.artworkUrl ?? null;
  const headerTint = useArtworkTint(_topPinnedArtwork);
  const [buildings, setBuildings] = useState<OSMBuilding[]>([]);
  // Dev-only: seed demo agent playlists for buildings that have no
  // pins yet, so the UI renders meaningful data before real users
  // tag anything. Idempotent — never overwrites real entries.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (buildings.length === 0) return;
    void import('./features/dev/seedAgents').then(({ seedBuildingPlaylists }) => {
      seedBuildingPlaylists(buildings.map((b) => b.id));
    });
  }, [buildings]);
  // Roads for the current area — loaded once per area and reused to snap
  // the Street View viewpoint onto real drivable segments (Google SV panos
  // only exist where cars drove, so road-snapping is the most reliable way
  // to avoid interior/lobby panoramas).
  const [roads, setRoads] = useState<OSMRoad[]>([]);
  // ── Apple-derived genre color hydration ───────────────────────────
  // Fire-and-forget: query iTunes Search for one canonical track per
  // Apple GenreKey, extract the dominant hue from each artwork, and
  // cache the result in localStorage. The current session keeps using
  // the static palette in `genres.ts`; the next reload hydrates from
  // the Apple-derived cache so every genre swatch is sourced from real
  // Apple Music data instead of editorial HIG picks.
  useEffect(() => {
    void loadAppleGenreColors(
      Object.fromEntries(
        Object.entries(STATIC_GENRE_COLORS).map(([k, v]) => [k, v.color]),
      ) as Record<keyof typeof STATIC_GENRE_COLORS, string>,
    );
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchOSMTerrain(area)
      .then((t) => {
        if (cancelled) return;
        setRoads(t.roads);
        if (typeof window !== 'undefined' && import.meta.env?.DEV) {
          (window as unknown as { __VIBLOC_ROADS__?: OSMRoad[] }).__VIBLOC_ROADS__ = t.roads;
        }
      })
      .catch(() => { if (!cancelled) setRoads([]); });
    return () => { cancelled = true; };
  }, [area]);
  // Dev-only: expose buildings on window for verification scripts.
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    (window as unknown as { __VIBLOC_BUILDINGS__?: OSMBuilding[] }).__VIBLOC_BUILDINGS__ = buildings;
  }
  const [geocodedInfo, setGeocodedInfo] = useState<{ name: string; address: string } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const manualDarkRef = useRef(false); // track if user manually toggled dark mode

  // --- Accessibility: respect user system preferences ---
  // See axesslab.com/glassmorphism-meets-accessibility — guidelines:
  //   1. WCAG 2.2 contrast: 4.5:1 body / 3:1 large UI
  //   2. Don't rely solely on blur for separation → use solid fills + borders
  //   3. Respect prefers-reduced-transparency
  //   4. Respect prefers-reduced-motion
  //   5. Avoid excessive blur (>20px is harsh)
  const [reducedTransparency, setReducedTransparency] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  // Mobile bottom-sheet (#8): desktop keeps the 440px right rail,
  // mobile (<768px) switches to a 3-snap non-modal bottom sheet
  // (NN/g bottom sheets, M3 standard side sheet adaptive). Snap
  // cycles peek → half → full on tapping the drag handle so the
  // canvas remains visible at "peek" and the user never loses the
  // 3D context. Reset to peek on every new building selection.
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [sheetSnap, setSheetSnap] = useState<'peek' | 'half' | 'full'>('half');
  useEffect(() => { setSheetSnap('half'); }, [selectedBuilding?.id]);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mqT = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const mqM = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      setReducedTransparency(mqT.matches);
      setReducedMotion(mqM.matches);
    };
    apply();
    mqT.addEventListener?.('change', apply);
    mqM.addEventListener?.('change', apply);
    return () => {
      mqT.removeEventListener?.('change', apply);
      mqM.removeEventListener?.('change', apply);
    };
  }, []);

  const handleNavigate = useCallback((pos: [number, number], height?: number, footprint?: [number, number][]) => {
    setNavigateTarget(null);
    requestAnimationFrame(() =>
      setNavigateTarget({ x: pos[0], z: pos[1], height, footprint })
    );
  }, []);

  const handleBuildingSelect = useCallback((b: OSMBuilding | null) => {
    setSelectedBuilding(b);
    setGeocodedInfo(null);
    setSanitizedCoord(null);
    if (b) {
      // Mirror the search-bar interaction: any building selection (3D click,
      // search, address-jump) should fly the camera to a consistent framing.
      // Standard pattern in BIM viewers (xeokit, Forge) and map libraries
      // (Mapbox flyTo, deck.gl FlyToInterpolator) — clicks are the user's
      // strongest "I want to see this" signal, so the viewport should follow.
      // Pass the full footprint so CameraNavigator can orient the 3/4 view
      // along the building's actual long axis.
      handleNavigate([b.center[0], b.center[1]], b.height, b.footprint);

      // Reverse geocode to get real name/address
      const config = CITY_AREAS[area];
      const { lat, lon } = metersToLatLon(b.center[0], b.center[1], config.refLat, config.refLon);
      setGeocoding(true);
      reverseGeocode(lat, lon).then((info) => {
        setGeocodedInfo(info);
        setGeocoding(false);
      });
    }
  }, [area, handleNavigate]);

  const handleSearchSelect = useCallback((b: OSMBuilding) => {
    handleBuildingSelect(b);
  }, [handleBuildingSelect]);

  const handleSunUpdate = useCallback((lightPos: [number, number, number], isDark: boolean) => {
    setSunLightPos(lightPos);
    // Auto-switch dark/light mode based on sun
    if (!manualDarkRef.current) {
      setDarkMode(isDark);
    }
  }, []);

  const handleDarkModeToggle = useCallback(() => {
    if (liveTimeEnabled) {
      // In live mode, manual toggle overrides auto — toggle it off on next sun change
      manualDarkRef.current = true;
      setDarkMode(v => !v);
      // Reset manual override after 3 seconds — let sun take over again
      setTimeout(() => { manualDarkRef.current = false; }, 3000);
    } else {
      setDarkMode(v => !v);
    }
  }, [liveTimeEnabled]);

  const handleLiveTimeToggle = useCallback((enabled: boolean) => {
    setLiveTimeEnabled(enabled);
    if (!enabled) {
      setSunLightPos(null); // revert to default light position
      manualDarkRef.current = false;
      // Hide the weather glyph as soon as the user leaves LIVE mode.
      useWeatherStore.getState().clear();
    } else {
      manualDarkRef.current = false; // let sun control dark mode
    }
  }, []);

  // ── Live weather hydration ────────────────────────────────────────
  // Whenever LIVE mode is on, fetch the current weather for the
  // city's reference coordinate. The fetch is cached for 10 minutes
  // (Open-Meteo refreshes hourly) and re-runs on area changes so
  // hopping cities updates the icon. The recommendation engine reads
  // the same store synchronously, so weather feeds both the visible
  // glyph AND the silent genre-mood bias without any extra plumbing.
  useEffect(() => {
    if (!liveTimeEnabled) return;
    const cfg = CITY_AREAS[area];
    if (!cfg) return;
    void useWeatherStore.getState().loadFor(cfg.refLat, cfg.refLon);
    // Refresh every 10 minutes while LIVE mode stays on so the glyph
    // tracks reality through long sessions (rain rolling in, etc.).
    const id = setInterval(() => {
      void useWeatherStore.getState().loadFor(cfg.refLat, cfg.refLon);
    }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [liveTimeEnabled, area]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <PlateauScene area={area} navigateTarget={navigateTarget} darkMode={darkMode} sunLightPos={sunLightPos} selectedBuilding={selectedBuilding} onBuildingSelect={handleBuildingSelect} onBuildingsLoaded={setBuildings} onSelectedAnchor={setBldgAnchor} />

      {/* Logo + Profile */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          zIndex: 20,
        }}
      >
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 20,
            fontWeight: 600,
            color: darkMode ? '#e0e0e8' : '#1a1a2e',
            letterSpacing: 4,
            userSelect: 'none',
            transition: 'color 0.4s ease',
          }}
        >
          VIBLOC
        </div>
        {/* Dev 프로필 버튼 */}
        {(() => {
          const user = useAuthStore.getState().user;
          if (!user) return null;
          return (
            <a
              href="/mypage"
              title="마이페이지"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 12px 4px 4px',
                borderRadius: 999,
                border: darkMode ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)',
                background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <UserAvatar user={user} size={26} className="" alt="" />
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  fontWeight: 600,
                  color: darkMode ? '#e0e0e8' : '#1a1a2e',
                  letterSpacing: 0.3,
                }}
              >
                {user.displayName ?? 'Profile'}
              </span>
            </a>
          );
        })()}
      </div>

      {/* Live Time slider */}
      <TimeSlider
        area={area}
        enabled={liveTimeEnabled}
        onToggle={handleLiveTimeToggle}
        onSunUpdate={handleSunUpdate}
        darkMode={darkMode}
      />

      {/* Dark mode toggle */}
      <button
        onClick={handleDarkModeToggle}
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          width: 40,
          height: 40,
          borderRadius: 12,
          border: darkMode ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(0,0,0,0.1)',
          background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          boxShadow: darkMode ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.06)',
          transition: 'all 0.4s ease',
        }}
        title={darkMode ? 'Light mode' : 'Dark mode'}
      >
        {darkMode ? '\u2600\uFE0F' : '\uD83C\uDF19'}
      </button>

      {/* Area selector — bottom-center per Mapbox/Apple Maps thumb-zone
          convention (#11). City switching is the most-used chrome
          control, so it lives in the most reachable spot. */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 6,
          zIndex: 15,
        }}
      >
        {(Object.keys(CITY_AREAS) as CityAreaKey[]).map((key) => (
          <button
            key={key}
            onClick={() => { setArea(key); setSelectedBuilding(null); setSanitizedCoord(null); }}
            style={{
              padding: '8px 14px',
              borderRadius: 12,
              border: area === key
                ? (darkMode ? '2px solid #e0e0e8' : '2px solid #1a1a2e')
                : (darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.1)'),
              background: area === key
                ? (darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(26,26,46,0.08)')
                : (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)'),
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              fontWeight: area === key ? 700 : 400,
              color: darkMode ? '#e0e0e8' : '#1a1a2e',
              cursor: 'pointer',
              boxShadow: darkMode ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.06)',
              transition: 'all 0.4s ease',
            }}
          >
            {t(`city.${key}`)}
          </button>
        ))}
        <LanguageToggle darkMode={darkMode} />
      </div>

      <SearchBar area={area} buildings={buildings} onSelectBuilding={handleSearchSelect} onNavigate={handleNavigate} darkMode={darkMode} />

      <Compass darkMode={darkMode} />

      <CanvasTour darkMode={darkMode} />

      <div
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          padding: '8px 16px',
          borderRadius: 12,
          background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(20px)',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          color: darkMode ? '#666' : '#666',
          transition: 'all 0.4s ease',
        }}
      >
        OpenStreetMap Data — ODbL
      </div>

      {/* ───────────────────── Building info panel — CarPlay style ─────────────────────
          Full-height side rail attached to the right edge.
          Inspired by Apple CarPlay (Maps Place card) and r/iOSdesign references:
            • Edge-to-edge dark glass surface
            • Large rounded card sections on a slightly lighter inner background
            • Generous padding, big bold title, monochromatic with tinted accents
            • Colored icon chips per tenant row instead of tiny dots
      */}
      {selectedBuilding && (() => {
        // ─── Accessible glassmorphism tokens ───
        // Following axesslab.com/glassmorphism-meets-accessibility:
        //   • Don't rely on blur alone — use solid semi-opaque fill (≥0.94 opacity)
        //     so text stays readable over any map background, and blur becomes a
        //     progressive enhancement only.
        //   • If user requests prefers-reduced-transparency → 100% opaque surface,
        //     no backdrop-filter at all.
        //   • Blur capped at 20px (guideline: 20px+ is harsh).
        //   • Text colors meet WCAG 2.2: body ≥4.5:1, large/bold ≥3:1.
        //     Dark: #f5f5f7 on #15151a ≈ 15.7:1 (body), #c7c7cc on #15151a ≈ 10.1:1 (secondary),
        //           #8e8e93 on #15151a ≈ 5.2:1 (tertiary — used only on ≥14px bold).
        //     Light: #1a1a2e on #f5f5f7 ≈ 14.3:1, #48484a on #f5f5f7 ≈ 8.3:1,
        //           #6e6e73 on #f5f5f7 ≈ 5.7:1.
        const opaque = reducedTransparency;
        // More glassy. Surface is quite see-through; cards are a touch more solid
        // to keep text legible. When prefers-reduced-transparency is set we snap
        // to fully opaque per axesslab guidance.
        const surface = opaque
          ? (darkMode ? '#15151a' : '#f5f5f7')
          : (darkMode ? 'rgba(18,18,22,0.38)' : 'rgba(245,245,247,0.32)');
        const card = opaque
          ? (darkMode ? '#1f1f24' : '#ffffff')
          : (darkMode ? 'rgba(28,28,34,0.48)' : 'rgba(255,255,255,0.50)');
        const cardSub = darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
        const text    = darkMode ? '#f5f5f7' : '#1a1a2e';   // ≥14:1 — body & headlines
        const text2   = darkMode ? '#c7c7cc' : '#48484a';   // ≥8:1 — secondary body
        const text3   = darkMode ? '#8e8e93' : '#6e6e73';   // ≥5:1 — only used at ≥12px bold
        const divider = darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
        const focusRing = darkMode ? '#60a5fa' : '#2563eb';

        const transitionMs = reducedMotion ? 0 : 240;

        // Category colors — hand-tuned for WCAG:
        //   • `text` is the ink color used for chip labels. Light-mode uses deeper
        //     shades to hit ≥4.5:1 on white chip fill; dark-mode uses lighter shades
        //     to hit ≥4.5:1 on solid dark chip fill.
        //   • `fill` is a SOLID semi-opaque background (not blur-dependent) strong
        //     enough to give the chip a readable contrast surface of its own.
        type Swatch = { fill: string; ink: string; icon: string };
        const colors: Record<string, { light: Swatch; dark: Swatch }> = {
          office:        { light: { fill: '#e7f0ff', ink: '#1d4ed8', icon: '#1d4ed8' }, dark: { fill: '#1e293b', ink: '#bfdbfe', icon: '#93c5fd' } },
          hotel:         { light: { fill: '#f1ecff', ink: '#6d28d9', icon: '#6d28d9' }, dark: { fill: '#2a1f3d', ink: '#ddd0ff', icon: '#c4b5fd' } },
          food:          { light: { fill: '#fff1d6', ink: '#92400e', icon: '#92400e' }, dark: { fill: '#3b2a12', ink: '#fde68a', icon: '#fcd34d' } },
          shop:          { light: { fill: '#d9f7e9', ink: '#047857', icon: '#047857' }, dark: { fill: '#13321f', ink: '#a7f3d0', icon: '#6ee7b7' } },
          residential:   { light: { fill: '#d4f4ef', ink: '#0f766e', icon: '#0f766e' }, dark: { fill: '#0f2e2b', ink: '#99f6e4', icon: '#5eead4' } },
          entertainment: { light: { fill: '#fde4f2', ink: '#be185d', icon: '#be185d' }, dark: { fill: '#3b1628', ink: '#fbcfe8', icon: '#f9a8d4' } },
          religious:     { light: { fill: '#fde7cf', ink: '#92400e', icon: '#92400e' }, dark: { fill: '#3a2411', ink: '#fed7aa', icon: '#fdba74' } },
          education:     { light: { fill: '#e2e0ff', ink: '#3730a3', icon: '#3730a3' }, dark: { fill: '#1e1c43', ink: '#c7d2fe', icon: '#a5b4fc' } },
          medical:       { light: { fill: '#ffe0e0', ink: '#b91c1c', icon: '#b91c1c' }, dark: { fill: '#3a1414', ink: '#fecaca', icon: '#fca5a5' } },
          government:    { light: { fill: '#e4e9f1', ink: '#334155', icon: '#334155' }, dark: { fill: '#1c2431', ink: '#cbd5e1', icon: '#94a3b8' } },
          other:         { light: { fill: '#ebecee', ink: '#374151', icon: '#374151' }, dark: { fill: '#22252c', ink: '#d1d5db', icon: '#9ca3af' } },
        };
        const swatch = (cat: string): Swatch => (colors[cat] || colors.other)[darkMode ? 'dark' : 'light'];

        // Single-letter glyph per category (CarPlay-like "icon chip")
        const glyph: Record<string, string> = {
          office: 'O', hotel: 'H', food: 'R', shop: 'S', residential: 'R',
          entertainment: 'E', religious: 'T', education: 'A', medical: '+',
          government: 'G', other: '·',
        };

        // ---- Title resolution: address-first ----
        // The panel shows the address as the headline (Google-Maps style).
        // For famous / wikidata-matched landmarks, the building name appears
        // as a small kicker label above the address.
        const rawName = (geocodedInfo?.name || selectedBuilding.name || '').trim();
        // Prefer the building's own address when it came from authoritative
        // sources (own addr:* tags or manual override). Only fall back to the
        // external reverseGeocode when our local data is borrowed/locality.
        // To prevent flicker: if we're still waiting on reverseGeocode AND
        // the local address is NOT authoritative, don't show the provisional
        // local value — wait for the geocode to resolve so the title appears
        // once and doesn't swap mid-read.
        const waitingForGeocode = geocoding && !selectedBuilding.addressOriginal;
        const addr = (
          selectedBuilding.addressOriginal
            ? (selectedBuilding.address || geocodedInfo?.address || '')
            : waitingForGeocode
              ? ''
              : (geocodedInfo?.address || selectedBuilding.address || '')
        ).trim();
        const hasRealName = !!rawName && rawName !== 'Building' && rawName !== addr;
        const allTags = selectedBuilding.tags || [];

        // "Famous" = building is large/tall AND has a real proper name,
        // OR has a wikidata-style enrichment tag (Owner/Architect rows imply Wikipedia hit).
        const isLarge = selectedBuilding.height >= 30 || selectedBuilding.levels >= 8;
        const hasWikiInfo = allTags.some(
          (t) => t.name && ['owner', 'operator', 'developer', 'architect'].includes((t.label || '').toLowerCase())
        );
        const isFamous = hasRealName && (isLarge || hasWikiInfo);
        const kicker = isFamous ? rawName : '';
        // While waiting for geocode resolution with no authoritative local
        // address, show a placeholder instead of a provisional value that
        // would flicker when the geocode arrives.
        const title = waitingForGeocode
          ? (kicker || t('panel.loadingAddr') || '…')
          : (addr || rawName || 'Building');
        const subtitle = ''; // address IS the title now — no subtitle line

        // Hoisted lat/lon for the building — needed both by the
        // deeplinks IIFE below AND by the music recommendation
        // engine in the scrollable body. Computed once here so the
        // two consumers stay in sync. Sanitized coord (from the
        // StreetViewBox subway-avoid sanitizer) overrides the raw
        // entry/centroid the moment Overpass resolves.
        const _cfg = CITY_AREAS[area];
        const [_px, _pz] = selectedBuilding.entry ?? selectedBuilding.center;
        const { lat: hoistedRawLat, lon: hoistedRawLon } = metersToLatLon(
          _px,
          _pz,
          _cfg.refLat,
          _cfg.refLon,
        );
        const buildingLat = sanitizedCoord?.lat ?? hoistedRawLat;
        const buildingLon = sanitizedCoord?.lon ?? hoistedRawLon;

        // ---- Generic-only listing ----
        // Show types ("Thai Restaurant", "Fashion Shop") instead of brand names.
        // Wiki-credit rows (Owner/Architect/Developer/Operator) are filtered out.
        const META_LABELS = new Set(['owner', 'operator', 'developer', 'architect']);
        // "Skyscraper" is a structural classification, not a tenant — it's
        // surfaced as a small header badge instead of cluttering the list.
        const isSkyscraper = allTags.some(
          (t) => (t.label || '').toLowerCase() === 'skyscraper'
        );
        const usefulTags = allTags.filter(
          (t) =>
            !META_LABELS.has((t.label || '').toLowerCase()) &&
            (t.label || '').toLowerCase() !== 'skyscraper'
        );

        // Tenant ordering: on large/tall buildings, push food & shop to the bottom.
        const tenantRank = (cat: string): number => {
          if (cat === 'hotel') return 0;
          if (cat === 'office') return 1;
          if (cat === 'medical' || cat === 'education' || cat === 'government') return 2;
          if (cat === 'entertainment' || cat === 'religious') return 3;
          if (cat === 'residential') return 4;
          if (cat === 'shop') return isLarge ? 90 : 5;
          if (cat === 'food') return isLarge ? 91 : 6;
          return 50;
        };

        // Deduplicate by label so identical generic types collapse into one row
        // with a count badge ("Thai Restaurant ×3"). We also collect the actual
        // tenant names per row so the expansion card can reveal real business
        // names ("Starbucks", "스타벅스") rather than just the generic type.
        type TenantEntry = {
          name: string;
          label: string;
          category: string;
          brandWikidata?: string;
          website?: string;
        };
        type LabelRow = {
          label: string;
          category: string;
          count: number;
          names: string[];
          tenants: TenantEntry[];
        };
        const labelMap = new Map<string, LabelRow>();
        for (const t of usefulTags) {
          const key = `${t.category}|${t.label.toLowerCase()}`;
          const existing = labelMap.get(key);
          if (existing) {
            existing.count++;
            if (t.name && t.name.trim() && !existing.names.includes(t.name.trim())) {
              existing.names.push(t.name.trim());
            }
            if (t.name && t.name.trim()) {
              existing.tenants.push({
                name: t.name.trim(),
                label: t.label,
                category: t.category,
                brandWikidata: t.brandWikidata,
                website: t.website,
              });
            }
          } else {
            const tenants: TenantEntry[] = [];
            if (t.name && t.name.trim()) {
              tenants.push({
                name: t.name.trim(),
                label: t.label,
                category: t.category,
                brandWikidata: t.brandWikidata,
                website: t.website,
              });
            }
            labelMap.set(key, {
              label: t.label,
              category: t.category,
              count: 1,
              names: t.name && t.name.trim() ? [t.name.trim()] : [],
              tenants,
            });
          }
        }
        const genericRows = Array.from(labelMap.values()).sort(
          (a, b) => tenantRank(a.category) - tenantRank(b.category)
        );
        // Tag chips were previously collapsed to one-per-category ("Restaurant",
        // "Shop"). Per user request the scope was widened — every distinct
        // generic row is its own clickable chip ("Thai Restaurant", "Bakery",
        // "Cafe ×2"...). Clicking a chip reveals its expanded card.
        type Pill = {
          key: string;
          label: string;
          category: string;
          count: number;
          names: string[];
          tenants: TenantEntry[];
        };
        const pills: Pill[] = genericRows.map((r) => ({
          key: `${r.category}|${r.label.toLowerCase()}`,
          label: r.label,
          category: r.category,
          count: r.count,
          names: r.names,
          tenants: r.tenants,
        }));

        // Flatten all tenants with names for the list view
        const allTenantsList: TenantEntry[] = pills.flatMap((p) => p.tenants);
        // Also include unnamed pills as generic entries
        for (const p of pills) {
          if (p.tenants.length === 0) {
            allTenantsList.push({
              name: translateTagLabel(p.label, lang),
              label: p.label,
              category: p.category,
            });
          }
        }
        const titleId = 'vibloc-place-title';

        // ── LEFT INFO PANEL (desktop only) ────────────────────────────
        // Minimal building info: kicker + address + height chip + map links.
        // Narrower than the right music panel, per user request.
        const config = CITY_AREAS[area];
        const [_lpx, _lpz] = selectedBuilding.entry ?? selectedBuilding.center;
        const { lat: _lRawLat, lon: _lRawLon } = metersToLatLon(
          _lpx, _lpz, config.refLat, config.refLon,
        );
        const _lLat = sanitizedCoord?.lat ?? _lRawLat;
        const _lLon = sanitizedCoord?.lon ?? _lRawLon;
        const _lGURL = googleMapsLink(_lLat, _lLon);
        const _lAURL = appleMapsLink(_lLat, _lLon, addr || rawName || 'Building');
        const _lCountry = AREA_COUNTRY[area];
        const _lNaverURL = _lCountry === 'KR' ? naverMapLink(_lLat, _lLon, rawName || 'Building') : null;
        const _lKakaoURL = _lCountry === 'KR' ? kakaoMapLink(_lLat, _lLon) : null;
        const _lYahooURL = _lCountry === 'JP' ? yahooJapanMapLink(_lLat, _lLon) : null;
        const _lBingURL  = _lCountry === 'US' ? bingMapsLink(_lLat, _lLon)    : null;
        // ── Building-anchored panel position ──
        // The actual top/left values are written each frame by the
        // rAF chase loop (see panelCurrentRef in the App body). We
        // only seed initial CSS here so the panel doesn't flash at
        // (0,0) before the first frame fires.
        const leftPanel = !isMobile ? (
          <div
            ref={leftPanelRef}
            style={{
              position: 'fixed',
              // Initial fallback — overwritten on first rAF tick.
              top: '38%',
              left: 360,
              width: 280,
              // Cap height so the floating panel never overflows the
              // viewport on small screens; internal scroll handles
              // long content (tenant lists, etc.).
              maxHeight: 'calc(100vh - 120px)',
              // Intentionally NO CSS transition — rAF lerp manages
              // motion frame-by-frame for a stutter-free chase.
              // Transparent — map shows through
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              fontFamily: "'IBM Plex Mono', monospace",
              color: text,
              display: 'flex',
              flexDirection: 'column',
              zIndex: 30,
              padding: '4px 20px 4px 4px',
              overflowY: 'auto',
              // Soft text shadow for readability over varying map content
              textShadow: darkMode
                ? '0 1px 2px rgba(0,0,0,0.6)'
                : '0 1px 2px rgba(255,255,255,0.7)',
            }}
          >
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1.4,
              textTransform: 'uppercase', color: text3, marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span aria-hidden="true" style={{
                width: 5, height: 5, borderRadius: '50%',
                background: darkMode ? '#ec4899' : '#db2777', flexShrink: 0,
              }}/>
              {t('panel.place')}
            </div>

            {kicker ? (
              <div style={{
                fontSize: 10.5, fontWeight: 600, color: text2, marginBottom: 2,
                letterSpacing: 0.1, lineHeight: 1.3, wordBreak: 'break-word',
              }}>{kicker}</div>
            ) : null}

            <div style={{
              fontSize: kicker ? 13 : 15, fontWeight: 700, lineHeight: 1.25,
              letterSpacing: -0.2, color: text, wordBreak: 'break-word',
            }}>{title}</div>

            {(selectedBuilding.height > 0 || selectedBuilding.levels > 0 || isSkyscraper) ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {(selectedBuilding.height > 0 || selectedBuilding.levels > 0) ? (
                  <span style={{
                    fontSize: 9.5, color: text2, fontWeight: 600,
                    letterSpacing: 0.3, textTransform: 'uppercase', opacity: 0.8,
                  }}>
                    {selectedBuilding.height > 0 ? `${Math.round(selectedBuilding.height)} m` : ''}
                    {selectedBuilding.height > 0 && selectedBuilding.levels > 0 ? ' · ' : ''}
                    {selectedBuilding.levels > 0 ? `${selectedBuilding.levels} F` : ''}
                  </span>
                ) : null}
                {isSkyscraper ? (
                  <span style={{
                    padding: '1px 6px', borderRadius: 999,
                    background: darkMode ? 'rgba(129,140,248,0.18)' : 'rgba(99,102,241,0.12)',
                    color: darkMode ? '#a5b4fc' : '#4f46e5',
                    fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
                    border: darkMode ? '1px solid rgba(165,180,252,0.25)' : '1px solid rgba(99,102,241,0.25)',
                    textShadow: 'none',
                  }}>{t('panel.skyscraper')}</span>
                ) : null}
              </div>
            ) : null}

            {geocoding && !kicker ? (
              <div style={{ fontSize: 10, color: text2, marginTop: 8 }} aria-live="polite">
                {t('panel.loadingAddr')}
              </div>
            ) : null}

            {/* Map deeplinks — compact row */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
              <a href={_lGURL} target="_blank" rel="noopener noreferrer" style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700,
                letterSpacing: 0.3, padding: '3px 8px', borderRadius: 6, textDecoration: 'none',
                color: darkMode ? '#0a0a0f' : '#fff',
                background: darkMode ? '#e0e0e8' : '#1a1a2e',
                textShadow: 'none',
              }}>Google Maps ↗</a>
              <a href={_lAURL} target="_blank" rel="noopener noreferrer" style={{
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700,
                letterSpacing: 0.3, padding: '3px 8px', borderRadius: 6, textDecoration: 'none',
                color: text, background: darkMode ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.5)',
                border: `1px solid ${divider}`, textShadow: 'none',
                backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
              }}>Apple Maps ↗</a>
              {(() => {
                const ghostBtn: React.CSSProperties = {
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, fontWeight: 700,
                  letterSpacing: 0.3, padding: '3px 8px', borderRadius: 6, textDecoration: 'none',
                  color: text,
                  background: darkMode ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.5)',
                  border: `1px solid ${divider}`,
                  whiteSpace: 'nowrap', textShadow: 'none',
                  backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                };
                const urls: { label: string; href: string }[] = [];
                if (_lNaverURL) urls.push({ label: '네이버맵', href: _lNaverURL });
                if (_lKakaoURL) urls.push({ label: '카카오맵', href: _lKakaoURL });
                if (_lYahooURL) urls.push({ label: 'Yahoo!地図', href: _lYahooURL });
                if (_lBingURL)  urls.push({ label: 'Bing', href: _lBingURL });
                return <LocaleDeeplinks urls={urls} ghostBtn={ghostBtn} lang={lang} />;
              })()}
            </div>

            {/* Street View — compact launcher */}
            {!streetViewExpanded ? (
              <button
                type="button"
                onClick={() => setStreetViewExpanded(true)}
                style={{
                  marginTop: 10, width: '100%', padding: '8px 12px',
                  borderRadius: 10, border: `1px dashed ${divider}`,
                  background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)',
                  backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, fontWeight: 700,
                  letterSpacing: 0.5, textTransform: 'uppercase', color: text2,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 6, textShadow: 'none',
                }}
              >
                <span aria-hidden="true">📷</span>
                Open Street View
              </button>
            ) : (() => {
              const seed = pickOutsideViewpoint(selectedBuilding);
              const snapped = snapToNearestRoad(seed.x, seed.z, selectedBuilding.center, roads);
              const vp = snapped ?? seed;
              const { lat: svLat, lon: svLon } = metersToLatLon(
                vp.x, vp.z, config.refLat, config.refLon,
              );
              return (
                <div style={{ marginTop: 14 }}>
                  <StreetViewBox
                    lat={svLat}
                    lon={svLon}
                    headingDeg={vp.headingDeg}
                    buildingName={rawName || null}
                    divider={divider}
                    darkMode={darkMode}
                    onSanitizedCoord={(slat, slon) => setSanitizedCoord({ lat: slat, lon: slon })}
                  />
                </div>
              );
            })()}

            {/* ── Tenant list (moved from right panel) ── */}
            {allTenantsList.length > 0 && (
              <div style={{
                marginTop: 14,
                borderTop: `1px solid ${divider}`,
                paddingTop: 10,
              }}>
                <div style={{
                  fontSize: 8.5, fontWeight: 800, letterSpacing: 0.7,
                  textTransform: 'uppercase', color: text3,
                  fontFamily: "'IBM Plex Mono', monospace",
                  marginBottom: 6,
                }}>
                  {t('panel.tenants') || '입점 정보'}
                </div>
                <div role="list" aria-label="Tenants" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {/* "더보기" removed — every tenant is rendered directly. */}
                  {allTenantsList.map((tenant, i) => {
                    const s = swatch(tenant.category);
                    const logoUrl = getTenantLogoUrl(tenant.name, tenant.website, tenant.brandWikidata);
                    return (
                      <div
                        key={`${tenant.category}-${tenant.name}-${i}`}
                        role="listitem"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 6px',
                          borderRadius: 6,
                          background: 'transparent',
                          border: 'none',
                          transition: reducedMotion ? 'none' : 'background 150ms ease',
                          cursor: 'default',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = darkMode
                            ? 'rgba(255,255,255,0.06)'
                            : 'rgba(0,0,0,0.04)';
                        }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div
                          style={{
                            width: 22, height: 22, borderRadius: 6,
                            background: logoUrl ? 'transparent' : s.fill,
                            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, overflow: 'hidden',
                          }}
                        >
                          {logoUrl ? (
                            <img src={logoUrl} alt="" width={16} height={16}
                              style={{ objectFit: 'contain', borderRadius: 2 }}
                              onError={(e) => {
                                const parent = e.currentTarget.parentElement;
                                if (parent) {
                                  parent.style.background = s.fill;
                                  e.currentTarget.replaceWith(
                                    Object.assign(document.createElement('span'), {
                                      textContent: CATEGORY_GLYPH[tenant.category] || '📍',
                                      style: 'font-size:10px',
                                    })
                                  );
                                }
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: 10 }}>{CATEGORY_GLYPH[tenant.category] || '📍'}</span>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div title={tenant.name} style={{
                            fontSize: 10, fontWeight: 600, color: text, lineHeight: 1.25,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{tenant.name}</div>
                          <div style={{
                            fontSize: 8, fontWeight: 600, color: text3, marginTop: 0,
                            letterSpacing: 0.25, textTransform: 'uppercase',
                          }}>{translateTagLabel(tenant.label, lang)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null;

        return (
          <>
          {leftPanel}
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            style={{
              position: 'fixed',
              ...(isMobile
                ? {
                    left: 0,
                    right: 0,
                    bottom: 0,
                    top: 'auto',
                    width: 'auto',
                    height:
                      sheetSnap === 'full'
                        ? '92vh'
                        : sheetSnap === 'half'
                        ? '60vh'
                        : '22vh',
                    borderTopLeftRadius: 22,
                    borderTopRightRadius: 22,
                    borderTop: `1px solid ${divider}`,
                    borderLeft: 'none',
                  }
                : {
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: 440,
                    borderLeft: `1px solid ${divider}`,
                  }),
              background: surface,
              // Very low opacity → rely more heavily on blur + saturation to keep
              // text legible against any map background.
              backdropFilter: opaque ? undefined : 'blur(32px) saturate(170%)',
              WebkitBackdropFilter: opaque ? undefined : 'blur(32px) saturate(170%)',
              boxShadow: darkMode
                ? (isMobile ? '0 -16px 50px rgba(0,0,0,0.55)' : '-16px 0 50px rgba(0,0,0,0.55)')
                : (isMobile ? '0 -16px 50px rgba(15,23,42,0.12)' : '-16px 0 50px rgba(15,23,42,0.12)'),
              fontFamily: "'IBM Plex Mono', monospace",
              color: text,
              display: 'flex',
              flexDirection: 'column',
              zIndex: 30,
              transition: reducedMotion
                ? 'none'
                : `background ${transitionMs}ms ease, height 320ms cubic-bezier(0.22,1,0.36,1)`,
              overflow: 'hidden', // contain the gradient glow
            }}
          >
            {isMobile && (
              <button
                type="button"
                onClick={() =>
                  setSheetSnap((s) =>
                    s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek',
                  )
                }
                aria-label="Adjust sheet height"
                style={{
                  position: 'absolute',
                  top: 6,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 60,
                  height: 22,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 5,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 38,
                    height: 4,
                    borderRadius: 2,
                    background: divider,
                  }}
                />
              </button>
            )}
            {/* Soft corner gradient glow — inspired by the Active Tasks reference.
                Kept subtle, low-contrast, and NEVER behind body text (sits in the header
                area only). Hidden when user prefers reduced transparency. */}
            {!opaque && (
              <>
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: -120,
                    right: -120,
                    width: 320,
                    height: 320,
                    borderRadius: '50%',
                    background: darkMode
                      ? 'radial-gradient(circle, rgba(236,72,153,0.18), rgba(236,72,153,0) 70%)'
                      : 'radial-gradient(circle, rgba(236,72,153,0.10), rgba(236,72,153,0) 70%)',
                    pointerEvents: 'none',
                    filter: 'blur(20px)',
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: -80,
                    left: -100,
                    width: 260,
                    height: 260,
                    borderRadius: '50%',
                    background: darkMode
                      ? 'radial-gradient(circle, rgba(96,165,250,0.14), rgba(96,165,250,0) 70%)'
                      : 'radial-gradient(circle, rgba(96,165,250,0.08), rgba(96,165,250,0) 70%)',
                    pointerEvents: 'none',
                    filter: 'blur(20px)',
                  }}
                />
              </>
            )}
            {/* Header — sticky title bar */}
            <div
              style={{
                padding: '28px 26px 22px',
                borderBottom: `1px solid ${divider}`,
                position: 'relative',
                zIndex: 1, // sit above the gradient glow
                // Apple Music iOS 26.4 paired-color tint (#10): a
                // very subtle wash derived from the top pinned
                // track's artwork. Sits behind the title only —
                // never behind body text, where it would risk
                // contrast. Falls through to neutral when no
                // playlist exists yet.
                background: headerTint
                  ? `linear-gradient(180deg, ${headerTint}33 0%, transparent 100%)`
                  : undefined,
                transition: reducedMotion ? 'none' : 'background 600ms ease',
              }}
            >
              <button
                onClick={() => setSelectedBuilding(null)}
                aria-label="Close building details"
                style={{
                  position: 'absolute',
                  top: 18,
                  right: 18,
                  width: 34,              // ≥24×24 recommended target (axesslab mentions WCAG 2.5.8)
                  height: 34,
                  borderRadius: 17,
                  background: cardSub,
                  border: `1px solid ${divider}`, // Visible edge — don't rely on fill alone
                  color: text,             // Full-contrast ink (≥14:1)
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'inherit',
                  transition: reducedMotion ? 'none' : 'background 0.15s ease, outline 0.1s ease',
                  outline: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = divider)}
                onMouseLeave={(e) => (e.currentTarget.style.background = cardSub)}
                onFocus={(e) => (e.currentTarget.style.outline = `2px solid ${focusRing}`)}
                onBlur={(e) => (e.currentTarget.style.outline = 'none')}
              >
                ×
              </button>

              {/* Desktop: building info lives in the LEFT panel (see below).
                  Mobile: keep everything in this bottom sheet — not enough
                  room for two panels. */}
              {isMobile && (<>
              {/* Overline with status dot (references: "• Backlog", "• In Progress") */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                  color: text3,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: darkMode ? '#ec4899' : '#db2777',
                    boxShadow: darkMode ? '0 0 10px rgba(236,72,153,0.6)' : 'none',
                    flexShrink: 0,
                  }}
                />
                {t('panel.place')}
              </div>
              {kicker ? (
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: text2,
                    marginBottom: 4,
                    letterSpacing: 0.2,
                    textTransform: 'none',
                    paddingRight: 44,
                    lineHeight: 1.3,
                    wordBreak: 'break-word',
                  }}
                >
                  {kicker}
                </div>
              ) : null}
              <div
                id={titleId}
                style={{
                  // Address is the headline. Slightly smaller than before so
                  // long Japanese / Korean lines fit without truncation.
                  fontSize: kicker ? 18 : 22,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  paddingRight: kicker ? 0 : 44,
                  letterSpacing: -0.3,
                  color: text,
                  wordBreak: 'break-word',
                }}
              >
                {title}
              </div>
              {(selectedBuilding.height > 0 || selectedBuilding.levels > 0 || isSkyscraper) ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  {(selectedBuilding.height > 0 || selectedBuilding.levels > 0) ? (
                    <span
                      style={{
                        fontSize: 11,
                        color: text2,
                        fontWeight: 600,
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                        opacity: 0.75,
                      }}
                    >
                      {selectedBuilding.height > 0 ? `${Math.round(selectedBuilding.height)} m` : ''}
                      {selectedBuilding.height > 0 && selectedBuilding.levels > 0 ? ' · ' : ''}
                      {selectedBuilding.levels > 0 ? `${selectedBuilding.levels} F` : ''}
                    </span>
                  ) : null}
                  {isSkyscraper ? (
                    <span
                      title={t('panel.skyscraper')}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: darkMode
                          ? 'rgba(129,140,248,0.18)'
                          : 'rgba(99,102,241,0.12)',
                        color: darkMode ? '#a5b4fc' : '#4f46e5',
                        fontSize: 9.5,
                        fontWeight: 800,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        border: darkMode
                          ? '1px solid rgba(165,180,252,0.25)'
                          : '1px solid rgba(99,102,241,0.25)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('panel.skyscraper')}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {geocoding && !kicker ? (
                <div style={{ fontSize: 12, color: text2, marginTop: 10 }} aria-live="polite">
                  {t('panel.loadingAddr')}
                </div>
              ) : null}
              {/* Plus Code + open-in-maps links.
                  The displayed address is composed from OSM tags and may not
                  match Google's canonical format for that exact building.
                  These deeplinks bypass the address text entirely — they
                  send Google Maps / Apple Maps to the BUILDING'S CENTER
                  COORDINATES, so the pin always lands on the right spot.
                  The Plus Code is shown next to them as a copy-pasteable
                  global identifier that also resolves in both apps. */}
              {(() => {
                const config = CITY_AREAS[area];
                // Prefer the OSM `entrance=*` node when available — it's the
                // pedestrian-walkable doorway, not the geometric centroid.
                // Falls back to the footprint centroid for buildings without
                // any tagged entrance node.
                const [px, pz] = selectedBuilding.entry ?? selectedBuilding.center;
                const { lat: rawLat, lon: rawLon } = metersToLatLon(
                  px,
                  pz,
                  config.refLat,
                  config.refLon,
                );
                // The StreetViewBox runs an OSM-based subway/station
                // sanitizer (Overpass) and reports the shifted lat/lon
                // back via `onSanitizedCoord`. We feed THAT into the
                // Google/Apple/locale deeplinks so when the user
                // clicks "Google Maps ↗" they land on a corrected
                // outdoor coordinate — not on top of a subway exit
                // that would open Street View into the concourse.
                // Until the sanitizer resolves we use the raw entry
                // coord; the deeplinks live-update the moment the
                // Overpass query lands.
                const lat = sanitizedCoord?.lat ?? rawLat;
                const lon = sanitizedCoord?.lon ?? rawLon;
                const gURL = googleMapsLink(lat, lon);
                const aURL = appleMapsLink(lat, lon, addr || rawName || 'Building');
                // Locale-aware secondary deeplinks. Naver/Kakao for KR users,
                // Yahoo Japan for JP users — these are the maps people in
                // those countries actually open. All free, no API.
                // Country-specific deeplinks ONLY render in their home
                // country — Naver/Kakao for KR, Yahoo!Japan for JP, Bing for
                // US. Everything else (Street View link, OSM, Directions,
                // geohash) was removed at the user's request to keep the
                // deeplink row minimal: Google + Apple + locale apps only.
                const country = AREA_COUNTRY[area];
                const naverURL = country === 'KR' ? naverMapLink(lat, lon, rawName || 'Building') : null;
                const kakaoURL = country === 'KR' ? kakaoMapLink(lat, lon) : null;
                const yahooURL = country === 'JP' ? yahooJapanMapLink(lat, lon) : null;
                const bingURL = country === 'US' ? bingMapsLink(lat, lon) : null;
                return (
                  <>
                    {/* Inline Google Street View preview. Chrome (address
                        bar + zoom controls) is hidden via overlay clipping
                        — wheel-on-hover handles zoom natively.

                        We DON'T reuse the entry/center point here: Google
                        snaps to the closest pano, which for mid-block
                        towers often resolves to an interior arcade pano.
                        Instead we pick an "outside viewpoint" — a point
                        just past the closest wall — and aim the camera
                        back at the building. */}
                    {streetViewExpanded ? (() => {
                      // Two-stage strategy: pick a viewpoint just
                      // outside the footprint, snap to the nearest
                      // drivable road, fall back to the seed if no
                      // road is within 60m.
                      const seed = pickOutsideViewpoint(selectedBuilding);
                      const snapped = snapToNearestRoad(
                        seed.x,
                        seed.z,
                        selectedBuilding.center,
                        roads,
                      );
                      const vp = snapped ?? seed;
                      const { lat: svLat, lon: svLon } = metersToLatLon(
                        vp.x,
                        vp.z,
                        config.refLat,
                        config.refLon,
                      );
                      return (
                        <StreetViewBox
                          lat={svLat}
                          lon={svLon}
                          headingDeg={vp.headingDeg}
                          buildingName={rawName || null}
                          divider={divider}
                          darkMode={darkMode}
                          onSanitizedCoord={(slat, slon) =>
                            setSanitizedCoord({ lat: slat, lon: slon })
                          }
                        />
                      );
                    })() : (
                      <button
                        type="button"
                        onClick={() => setStreetViewExpanded(true)}
                        style={{
                          marginTop: 12,
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: `1px dashed ${divider}`,
                          background: 'transparent',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.6,
                          textTransform: 'uppercase',
                          color: text2,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                        aria-expanded={false}
                      >
                        <span aria-hidden="true">📷</span>
                        Open Street View
                      </button>
                    )}
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      marginTop: 12,
                    }}
                  >
                    <a
                      href={gURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        padding: '4px 10px',
                        borderRadius: 8,
                        textDecoration: 'none',
                        color: darkMode ? '#0a0a0f' : '#fff',
                        background: darkMode ? '#e0e0e8' : '#1a1a2e',
                      }}
                    >
                      Google Maps ↗
                    </a>
                    <a
                      href={aURL}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        padding: '4px 10px',
                        borderRadius: 8,
                        textDecoration: 'none',
                        color: text,
                        background: 'transparent',
                        border: `1px solid ${divider}`,
                      }}
                    >
                      Apple Maps ↗
                    </a>
                    {/* Country-specific map apps — only render in their
                        home country so JP users get Yahoo!地図, KR users
                        get 네이버/카카오, US users get Bing. */}
                    {(() => {
                      const ghostBtn: React.CSSProperties = {
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        padding: '4px 10px',
                        borderRadius: 8,
                        textDecoration: 'none',
                        color: text,
                        background: 'transparent',
                        border: `1px solid ${divider}`,
                        whiteSpace: 'nowrap',
                      };
                      const localeUrls: { label: string; href: string }[] = [];
                      if (naverURL) localeUrls.push({ label: '네이버맵', href: naverURL });
                      if (kakaoURL) localeUrls.push({ label: '카카오맵', href: kakaoURL });
                      if (yahooURL) localeUrls.push({ label: 'Yahoo!地図', href: yahooURL });
                      if (bingURL) localeUrls.push({ label: 'Bing', href: bingURL });
                      return <LocaleDeeplinks urls={localeUrls} ghostBtn={ghostBtn} lang={lang} />;
                    })()}
                  </div>
                  </>
                );
              })()}
              </>)}

            </div>

            {/* Scrollable body */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '18px 20px 32px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                position: 'relative',
                zIndex: 1, // above gradient glow
              }}
            >
              {/* Music sections — actions-first ordering per Google
                    Place Card convention (verbs above the fold) and
                    the 2026 UI/UX research synthesis (#1 priority):
                      1. Tag a Track — primary verb, always above the
                         fold so the user knows what this app is for.
                      2. AI Top Pick — single recommendation visible
                         immediately, "Show 4 more" reveals the rest
                         (progressive disclosure).
                      3. My Playlist — what the user has already
                         curated for this building.
                      4. City Vibe — ambient context, lowest priority. */}
              {detailTaggerId ? (
                <PlaylistDetailView
                  buildingId={selectedBuilding.id}
                  taggerId={detailTaggerId}
                  text={text}
                  text2={text2}
                  text3={text3}
                  divider={divider}
                  onBack={() => setDetailTaggerId(null)}
                />
              ) : (<>
              {/* Order per latest user request:
                    1. CITY VIBE     — ambient context for the building
                    2. SEARCH        — composer between vibe and ranking
                    3. TOP PLAYLISTS — ranked curators 1~3 (heart-clickable)
                    4. TOP PICKS     — most-popular individual track
                    5. AI 추천곡      — full list, no progressive disclosure
                    6. MY PLAYLIST   — what's currently pinned here */}
              <CityVibeBlock
                vibe={getCityVibe(area)}
                text={text}
                text3={text3}
                divider={divider}
              />

              <AddTrackComposer
                buildingId={selectedBuilding.id}
                vibe={getCityVibe(area)}
                text={text}
                text2={text2}
                text3={text3}
                divider={divider}
              />

              {/* Top 1~3 playlists by likes — row click opens detail,
                  heart pill (stopPropagation) toggles a playlist-level like. */}
              <TopTaggerCard
                buildingId={selectedBuilding.id}
                text={text}
                text2={text2}
                text3={text3}
                divider={divider}
                onSelect={(id) => setDetailTaggerId(id)}
              />

              {/* Most popular TRACK — placed below the playlist ranking.
                  Falls back to nearby buildings when this one has no pins. */}
              <PopularTrackCard
                buildingId={selectedBuilding.id}
                text={text}
                text2={text2}
                text3={text3}
                divider={divider}
              />

              <RecommendedList
                area={area}
                lat={buildingLat}
                lon={buildingLon}
                buildingName={hasRealName ? rawName : null}
                buildingId={selectedBuilding.id}
                buildingTags={selectedBuilding.tags}
                text={text}
                text2={text2}
                text3={text3}
                divider={divider}
              />

              <BuildingPlaylist
                buildingId={selectedBuilding.id}
                cityVibe={getCityVibe(area)}
                text={text}
                text2={text2}
                text3={text3}
                divider={divider}
              />
              </>)}

              {/* Tenant list — on mobile stays here (no left panel),
                  on desktop lives in the left panel */}
              {isMobile && allTenantsList.length > 0 && (
                <div style={{ marginTop: 4, paddingTop: 12, borderTop: `1px solid ${divider}` }}>
                  <div style={{
                    fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8,
                    textTransform: 'uppercase', color: text3,
                    fontFamily: "'IBM Plex Mono', monospace",
                    marginBottom: 8,
                  }}>
                    {t('panel.tenants') || '입점 정보'}
                  </div>
                  <div role="list" aria-label="Tenants" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* "더보기" removed — render every tenant. */}
                    {allTenantsList.map((tenant, i) => {
                      const s = swatch(tenant.category);
                      const logoUrl = getTenantLogoUrl(tenant.name, tenant.website, tenant.brandWikidata);
                      return (
                        <div
                          key={`m-${tenant.category}-${tenant.name}-${i}`}
                          role="listitem"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '8px 12px', borderRadius: 12,
                            background: card, border: `1px solid ${divider}`,
                            transition: reducedMotion ? 'none' : 'background 150ms ease',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = cardSub; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = card; }}
                        >
                          <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: logoUrl ? 'transparent' : s.fill,
                            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, overflow: 'hidden',
                          }}>
                            {logoUrl ? (
                              <img src={logoUrl} alt="" width={28} height={28}
                                style={{ objectFit: 'contain', borderRadius: 4 }}
                                onError={(e) => {
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) {
                                    parent.style.background = s.fill;
                                    e.currentTarget.replaceWith(
                                      Object.assign(document.createElement('span'), {
                                        textContent: CATEGORY_GLYPH[tenant.category] || '📍',
                                        style: 'font-size:16px',
                                      })
                                    );
                                  }
                                }}
                              />
                            ) : (
                              <span style={{ fontSize: 16 }}>{CATEGORY_GLYPH[tenant.category] || '📍'}</span>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div title={tenant.name} style={{
                              fontSize: 13, fontWeight: 600, color: text, lineHeight: 1.3,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{tenant.name}</div>
                            <div style={{
                              fontSize: 10.5, fontWeight: 600, color: text3, marginTop: 1,
                              letterSpacing: 0.3, textTransform: 'uppercase',
                            }}>{translateTagLabel(tenant.label, lang)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              </div>
          </div>
          </>
        );
      })()}
    </div>
  );
}

export default App;
