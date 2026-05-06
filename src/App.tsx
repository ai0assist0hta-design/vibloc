import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FONT, SECTION_HEADER } from './lib/ui/tokens';
import { useDarkModeStore } from './lib/app/useDarkMode';
import { PlateauScene, type NavTarget, type BuildingScreenAnchor } from './components/canvas/PlateauScene';
import { TimeSlider } from './components/ui/TimeSlider';
import { WeatherDevToggle } from './components/ui/WeatherDevToggle';
import { LanguageToggle } from './components/ui/LanguageToggle';
import { CityDropdown } from './components/ui/CityDropdown';
import { CanvasTour } from './components/ui/CanvasTour';
import { OnboardingCoachmark } from './components/ui/OnboardingCoachmark';
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
import { FeaturedPlaylistHero } from './components/ui/music/FeaturedPlaylistHero';
import { PopularTrackCard } from './components/ui/music/PopularTrackCard';
import { NowPlayingBar } from './components/ui/music/NowPlayingBar';
import { FixedQueueSidebar } from './components/ui/music/FixedQueueSidebar';
import { UpNextPanel } from './components/ui/music/UpNextPanel';
import { FixedToolSidebar } from './components/ui/FixedToolSidebar';
import { ToastHost } from './components/ui/ToastHost';
import { PlaylistDetailView } from './components/ui/music/PlaylistDetailView';
import { getCityVibe } from './lib/music/cityProfile';
import { getTenantLogoUrl, CATEGORY_ICON } from './lib/geo/tenantLogo';
import { tenantClickUrl } from './lib/geo/tenantClickUrl';
import { MapPin } from 'lucide-react';
import { pickOutsideViewpoint, snapToNearestRoad } from './lib/streetview/streetViewViewpoint';
import { loadAppleGenreColors } from './lib/music/genreColorSource';
import { useArtworkTint } from './lib/music/headerTint';
import { getTopTaggers, getTracksByTagger, usePlaylist } from './lib/music/buildingPlaylist';
import { getPlayerStateSnapshot, playPreview, preloadPreview, restoreContinuePlaying, setQueue } from './components/ui/music/PreviewPlayer';
import { subscribeAuthSync } from './features/auth/supabaseAuth';
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

/** Locked visible height of both floating panels (left + right) so
 *  they always render at exactly the same vertical extent — content
 *  scrolls inside whichever panel overflows. `min(…, 720px)` caps the
 *  height on tall screens so the panel doesn't dwarf the building. */
const PANEL_CONTENT_H = 'min(calc(100vh - 140px), 720px)';

/** Inner padding used by both floating panels' content layer.
 *  Identical between left and right so the section eyebrows (PLACE /
 *  MUSIC) sit on the exact same Y and the two panels read as a
 *  paired design system. */
const PANEL_INNER_PAD = '14px 18px 18px 18px';
import './index.css';

/**
 * Country-specific deeplinks collapsed under a "더보기 / more" toggle.
 *
 * NN/g Disclosure pattern: keeps the primary actions (Google + Apple) always
 * visible while moving locale-specific apps one tap away. Lower visual noise
 * for the 99% case where the user just wants Google/Apple, no loss of
 * functionality for the locals who actually use 네이버/카카오/Yahoo!地図/Bing.
 */
/**
 * Single-button map launcher — replaces the Google / Apple / 더보기
 * row. Default state shows just one neutral "Maps" pill; clicking it
 * fans the destinations out **horizontally to the right** so the panel
 * height never jumps. Every option uses the same ghost style — no
 * filled Google button, no colored accents — so the row reads as one
 * unified control.
 *
 * Labels intentionally drop the "Maps" suffix per request:
 * "Google" / "Apple" / "네이버" / "카카오" / "Yahoo!地図" / "Bing".
 */
function MapsToggle({
  options,
  ghostBtn,
  lang,
}: {
  options: { label: string; href: string }[];
  ghostBtn: React.CSSProperties;
  lang: 'ko' | 'ja' | 'en';
}) {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;
  const closeLabel = lang === 'ko' ? '닫기' : lang === 'ja' ? '閉じる' : 'close';
  // Motion language matches the rest of the panel:
  //   • cubic-bezier(0.22, 1, 0.36, 1) ease-out (same as panel chase)
  //   • 180ms primary / 280ms container reveal
  //   • options stagger 35ms each on open, snap closed in reverse
  // The horizontal "fan" never collapses panel height because the
  // container animates max-width inside an overflow:hidden wrapper.
  const REVEAL_MS = 280;
  const ITEM_MS = 180;
  const STAGGER_MS = 35;
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? closeLabel : 'Maps'}
        style={{ ...ghostBtn, cursor: 'pointer' }}
      >
        Maps
      </button>
      <div
        aria-hidden={!open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          overflow: 'hidden',
          // Container width grows from 0 → enough-for-all, then options
          // fade+slide in over the top. 800px is a safe upper bound for
          // the longest possible label set; max-width transition is
          // smooth as long as content fits comfortably.
          maxWidth: open ? 800 : 0,
          marginLeft: open ? 4 : 0,
          transitionProperty: 'max-width, margin-left',
          transitionDuration: `${REVEAL_MS}ms, 200ms`,
          transitionTimingFunction: `${EASE}, ease`,
        }}
      >
        {options.map((u, idx) => (
          <a
            key={u.label}
            href={u.href}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={open ? 0 : -1}
            style={{
              ...ghostBtn,
              opacity: open ? 1 : 0,
              transform: open ? 'translateX(0)' : 'translateX(-6px)',
              transitionProperty: 'opacity, transform',
              transitionDuration: `${ITEM_MS}ms, ${ITEM_MS}ms`,
              transitionTimingFunction: `ease, ${EASE}`,
              // Stagger from left to right on open; reverse + shorter
              // delays on close so the row clears quickly.
              transitionDelay: open
                ? `${60 + idx * STAGGER_MS}ms`
                : `${(options.length - idx - 1) * 15}ms`,
              pointerEvents: open ? 'auto' : 'none',
            }}
          >
            {u.label}
          </a>
        ))}
      </div>
    </div>
  );
}

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

  // ── URL deep-link params ──
  // `?area=shinjuku` opens the map straight on a city.
  // `?building=way/123` auto-selects that building once OSM data
  // for the matching city has loaded. Both are produced by the
  // landing chips and the MyPage playlist "바로가기" button.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAreaParam = searchParams.get('area');
  const initialArea: CityAreaKey =
    initialAreaParam && initialAreaParam in CITY_AREAS
      ? (initialAreaParam as CityAreaKey)
      : 'shinjuku';
  const pendingBuildingId = searchParams.get('building');

  const [area, setArea] = useState<CityAreaKey>(initialArea);
  // Navigation target: world (x, z) plus optional height and footprint.
  // The footprint lets CameraNavigator orient the fly-to along the building's
  // actual long axis (OBB), so long Manhattan slabs and rotated towers get a
  // proper 3/4 view instead of an edge-on shot from a hard-coded SE diagonal.
  const [navigateTarget, setNavigateTarget] = useState<NavTarget | null>(null);
  // Dark mode lives in a global zustand store (persisted to
  // localStorage) so the user's choice carries across every route —
  // map → mypage → playlist → auth → landing all flip together until
  // the user toggles it back. The auto-flip from sun position (LIVE
  // mode) writes through this same setter, so manual + automatic
  // sources stay in sync. Initial value hydrates synchronously from
  // localStorage on first render → no light-then-dark flash.
  const darkMode = useDarkModeStore((s) => s.darkMode);
  const setDarkMode = useDarkModeStore((s) => s.setDarkMode);
  // Live mode defaults ON — design pass: real-time sun/weather is
  // the canonical experience, manual override is the exception.
  // Sidebar toggle still flips this off for users who explicitly
  // want a static scene.
  const [liveTimeEnabled, setLiveTimeEnabled] = useState(true);
  const [sunLightPos, setSunLightPos] = useState<[number, number, number] | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<OSMBuilding | null>(null);
  // Tenant list cap — once the list exceeds this many rows it is
  // wrapped in a max-height scrolling pane (keeps the panel from
  // exploding vertically without hiding any data behind a click).
  const TENANT_SCROLL_AFTER = 10;
  const TENANT_SCROLL_MAX_PX = 360;
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

  // Boot: restore the user's last-played track + queue from localStorage
  // so the NowPlayingBar lands on a "Continue Playing" state instead
  // of empty. Track stays paused until the first user gesture
  // (browser autoplay policy).
  useEffect(() => {
    restoreContinuePlaying();
    // Wire Supabase's auth state into our zustand store. Returns
    // an unsubscribe; React handles the cleanup. Safe no-op when
    // VITE_SUPABASE_URL is not configured.
    return subscribeAuthSync();
  }, []);

  const restoredBuildingRef = useRef(false);
  // ── Smooth panel motion (zero-render, rAF-driven) ──
  // The previous implementation used React state for the building's
  // projected screen anchor — which fired setState every frame the
  // camera moved (60+ Hz) and caused the App tree to re-render at
  // the same rate. That produced visible stutter while orbiting.
  //
  // New design: the anchor lives in a REF that the projector mutates
  // directly (no setState). The rAF chase loop reads the ref each
  // frame, computes the target inline, lerps current toward target,
  // and writes the result straight to the DOM via leftPanelRef.
  // Result: ZERO React re-renders for camera motion → no stutter.
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  // Mirror panel on the OPPOSITE side of the building from leftPanel
  // (TOP PLAYLISTS callout with 1/2/3 medals). Same chase/scale rules.
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const bldgAnchorRef = useRef<BuildingScreenAnchor | null>(null);
  const panelCurrentRef = useRef<{ left: number; top: number; scale: number } | null>(null);
  const panelCurrentRightRef = useRef<{ left: number; top: number; scale: number } | null>(null);
  // Latest tenant-list length, updated from inside the panel render.
  const tenantCountRef = useRef(0);

  // Reset chase state when the selected building changes so the panel
  // snaps to the new building (rather than lerping across the screen
  // from the previous anchor).
  useEffect(() => {
    if (!selectedBuilding) {
      bldgAnchorRef.current = null;
    }
    panelCurrentRef.current = null;
    panelCurrentRightRef.current = null;
  }, [selectedBuilding]);

  // Single rAF loop owns the entire panel motion: computeTarget per
  // frame from the ref, lerp, write DOM. Mounted once for the App's
  // lifetime; cheap (a handful of math ops + one inline-style write).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const PANEL_W = 320;
    const PANEL_H_ESTIMATE = 380;
    const RIGHT_MUSIC_W = 440;
    const PANEL_VIEWPORT_INSET = 16;
    const PANEL_HEADER_INSET = 80;
    const PANEL_BOTTOM_INSET = 24;
    const HALF_LIFE_MS = 110;

    function clamp(v: number, lo: number, hi: number): number {
      return Math.max(lo, Math.min(hi, v));
    }

    /** Auto-shrink everything below this viewport width so the panels
     *  + city UI stay legible on small screens. Above 1280px = 1.0
     *  (no shrink). Down to ~800px = 0.7. Floor at 0.55 so things
     *  never become unreadably tiny. */
    function viewportScale(): number {
      const vw = window.innerWidth;
      if (vw >= 1280) return 1.0;
      if (vw <= 700)  return 0.55;
      return clamp(vw / 1280, 0.55, 1.0);
    }

    /** Pure scale + Y position derived from the building anchor.
     *  Shared by leftPanel and rightPanel so they always sit at
     *  exactly the same height with the same shrink ratio — true
     *  mirror image across the building. */
    function panelMetrics(anchor: BuildingScreenAnchor): {
      scale: number; gapX: number; gapY: number;
      topY: number; safeRightLimit: number;
    } {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const bbW = Math.max(0, anchor.right - anchor.left);
      const bbH = Math.max(0, anchor.bottom - anchor.top);
      const bbMax = Math.max(bbW, bbH);
      const REFERENCE_BBMAX = 700;
      const HEAD_ROOM = 0.65;
      const MIN_SCALE = 0.28;
      const ratio = clamp(bbMax / REFERENCE_BBMAX, 0, 1);
      let scale: number;
      if (ratio >= HEAD_ROOM) scale = 1.0;
      else {
        const t = ratio / HEAD_ROOM;
        const s = t * t * (3 - 2 * t);
        scale = MIN_SCALE + (1 - MIN_SCALE) * s;
      }
      scale = scale * viewportScale();
      const gapX = 180 * scale;
      const gapY = 96 * scale;
      const safeRightLimit = vw - RIGHT_MUSIC_W - gapX;
      const tenantCount = tenantCountRef.current;
      const tenantLift = tenantCount >= 5
        ? Math.min(180, (tenantCount - 4) * 28)
        : 0;
      const minY = PANEL_HEADER_INSET;
      const maxY = vh - PANEL_BOTTOM_INSET - PANEL_H_ESTIMATE;
      // ── Vertical placement ──
      // Old: anchor at the building's TOP edge. That worked for short
      // buildings but slammed the panel into the screen ceiling for
      // skyscrapers (anchor.top → ~50 px → topY clamped to header
      // inset, way above the eye line).
      // New: blend toward the building's CENTER as the on-screen
      // vertical extent grows. Short building → behaves like before;
      // tall building → panel sits beside the centre of the silhouette.
      const bbScreenH = Math.max(0, anchor.bottom - anchor.top);
      // Tall blend kicks in once the silhouette occupies > ~38% of
      // viewport height. Below that, the original top-anchored math
      // wins (no jump for normal mid-rise blocks).
      const tallness = clamp((bbScreenH / vh - 0.38) / 0.42, 0, 1);
      const topAnchored = anchor.top - gapY;
      const centerAnchored = (anchor.top + anchor.bottom) / 2 - PANEL_H_ESTIMATE / 2;
      const ideal = topAnchored * (1 - tallness) + centerAnchored * tallness
                    - tenantLift * (1 - tallness * 0.5);
      const topY = Math.max(minY, Math.min(maxY, ideal));
      return { scale, gapX, gapY, topY, safeRightLimit };
    }

    function computeTarget(
      anchor: BuildingScreenAnchor | null,
    ): { left: number; top: number; scale: number } {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!anchor || !anchor.inFront) {
        return { left: 360, top: vh * 0.30, scale: viewportScale() };
      }
      // Zoom-aware sizing — use the LARGER projected dimension as the
      // size driver. Wide low buildings dominate horizontally (large
      // bbW); tall slim towers dominate vertically (large bbH after
      // the camera flies back to fit the whole tower in frame). Using
      // max(bbW, bbH) keeps the panel at full size in BOTH cases at
      // the default-fit zoom, so a 270m skyscraper doesn't accidentally
      // get a 50%-shrunk tiny panel just because its silhouette is
      // narrow horizontally.
      const bbW = Math.max(0, anchor.right - anchor.left);
      const bbH = Math.max(0, anchor.bottom - anchor.top);
      const bbMax = Math.max(bbW, bbH);
      const REFERENCE_BBMAX = 700; // ≈ post-fly-to dominant size on 1080p
      const HEAD_ROOM = 0.65;     // shrink starts a touch earlier
      const MIN_SCALE = 0.28;     // shrink further when fully zoomed out
      const m = panelMetrics(anchor);
      // ALWAYS sit on the LEFT side of the building. If LEFT clips
      // off-screen, slide right toward the viewport edge but never
      // jump to RIGHT/ABOVE — the right panel is mirrored from this
      // one, and any side-flip would let them overlap.
      const idealLx = anchor.left - m.gapX - PANEL_W;
      const minX = PANEL_VIEWPORT_INSET;
      // Cap left edge so leftPanel can't cross past building's centre
      // — keeps it visually "to the left".
      const maxX = (anchor.left + anchor.right) / 2 - PANEL_W - m.gapX * 0.5;
      const left = Math.max(minX, Math.min(maxX, idealLx));
      return { left, top: m.topY, scale: m.scale };
    }

    /** Mirror of `computeTarget` for the right-side TOP PLAYLISTS
     *  callout. Same scale + tenant-lift logic; placement preference
     *  is REVERSED (RIGHT first, LEFT fallback) and the music panel
     *  collision check still applies on the right side. */
    function computeTargetRight(
      anchor: BuildingScreenAnchor | null,
    ): { left: number; top: number; scale: number } {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!anchor || !anchor.inFront) {
        return { left: vw - 360 - PANEL_W, top: vh * 0.30, scale: viewportScale() };
      }
      const m = panelMetrics(anchor);
      // PURE MIRROR of leftPanel: same Y, same scale, opposite side.
      // Sit on the RIGHT of the building. Clamp to safeRightLimit so
      // the panel never slides under the music side rail.
      const idealLx = anchor.right + m.gapX;
      // Min: must stay past building's centre so the two panels never
      // overlap horizontally.
      const minX = (anchor.left + anchor.right) / 2 + m.gapX * 0.5;
      const maxX = Math.max(minX, m.safeRightLimit - PANEL_W);
      const left = Math.max(minX, Math.min(maxX, idealLx));
      return { left, top: m.topY, scale: m.scale };
    }

    let raf = 0;
    let prev = performance.now();
    function step(now: number) {
      const dt = Math.max(1, now - prev);
      prev = now;
      const el = leftPanelRef.current;
      if (el) {
        const target = computeTarget(bldgAnchorRef.current);
        let c = panelCurrentRef.current;
        if (!c) {
          // First frame after mount or after selection change → snap
          // so the panel doesn't visibly fly across the screen.
          c = { ...target };
          panelCurrentRef.current = c;
        } else {
          // Frame-rate-independent exponential smoother. alpha = 1 -
          // 0.5^(dt/halfLife) → covers half the remaining distance
          // every HALF_LIFE_MS regardless of refresh rate.
          const alpha = 1 - Math.pow(0.5, dt / HALF_LIFE_MS);
          c.left  += (target.left  - c.left)  * alpha;
          c.top   += (target.top   - c.top)   * alpha;
          c.scale += (target.scale - c.scale) * alpha;
          if (Math.abs(target.left  - c.left)  < 0.25)  c.left  = target.left;
          if (Math.abs(target.top   - c.top)   < 0.25)  c.top   = target.top;
          if (Math.abs(target.scale - c.scale) < 0.005) c.scale = target.scale;
        }
        el.style.left = `${c.left}px`;
        el.style.top = `${c.top}px`;
        el.style.transform = `scale(${c.scale})`;
        // Zoom-out fog: as the panel shrinks, fade it slightly so it
        // visually "recedes into the haze" with the building. Subtle
        // by request — never below 65% opacity, with a touch of
        // desaturation so colored chips don't pop while everything
        // else is muted. At scale = 1 (default fit) the panel is
        // 100% opaque and unfiltered.
        // Map remaining scale-headroom (1 → MIN_SCALE 0.28) to 0..1
        // for fog. Keeps the fog curve hitting full strength exactly
        // when the panel has shrunk to its smallest size.
        const fogT = Math.max(0, Math.min(1, (1 - c.scale) / 0.72));
        const opacity  = 1 - fogT * 0.65;       // 1.0 → 0.35
        const saturate = 1 - fogT * 0.45;       // 1.0 → 0.55
        const blurPx   = fogT * 1.6;            // 0   → 1.6 px
        el.style.opacity = `${opacity}`;
        // IMPORTANT: setting `filter` on the parent breaks the child
        // halo's `backdrop-filter` (the parent becomes a backdrop
        // root, so the halo can no longer sample the map behind it).
        // Only enable the parent filter once fog actually starts —
        // by that point the panel is shrinking + fading and the halo
        // is barely visible anyway, so losing it is fine.
        if (fogT > 0.001) {
          el.style.filter = `saturate(${saturate}) blur(${blurPx}px)`;
        } else {
          el.style.filter = 'none';
        }
      }

      // ── Mirror chase for the right-side TOP PLAYLISTS callout ──
      const elR = rightPanelRef.current;
      if (elR) {
        const targetR = computeTargetRight(bldgAnchorRef.current);
        let cR = panelCurrentRightRef.current;
        if (!cR) {
          cR = { ...targetR };
          panelCurrentRightRef.current = cR;
        } else {
          const alpha = 1 - Math.pow(0.5, dt / HALF_LIFE_MS);
          cR.left  += (targetR.left  - cR.left)  * alpha;
          cR.top   += (targetR.top   - cR.top)   * alpha;
          cR.scale += (targetR.scale - cR.scale) * alpha;
          if (Math.abs(targetR.left  - cR.left)  < 0.25)  cR.left  = targetR.left;
          if (Math.abs(targetR.top   - cR.top)   < 0.25)  cR.top   = targetR.top;
          if (Math.abs(targetR.scale - cR.scale) < 0.005) cR.scale = targetR.scale;
        }
        elR.style.left = `${cR.left}px`;
        elR.style.top = `${cR.top}px`;
        elR.style.transform = `scale(${cR.scale})`;
        const fogTR = Math.max(0, Math.min(1, (1 - cR.scale) / 0.72));
        elR.style.opacity = `${1 - fogTR * 0.65}`;
        if (fogTR > 0.001) {
          elR.style.filter = `saturate(${1 - fogTR * 0.45}) blur(${fogTR * 1.6}px)`;
        } else {
          elR.style.filter = 'none';
        }
      }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The projector mutates the ref directly. NO setState → no React
  // re-renders triggered by camera motion.
  const onSelectedAnchor = useCallback((a: BuildingScreenAnchor | null) => {
    bldgAnchorRef.current = a;
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

  // After the building list loads, re-select the building the
  // restored snapshot was anchored to. Without this, prev/next on
  // the bar still works (queue is restored) but the right rail
  // shows the empty state until the user clicks something — and
  // the + pin button on the bar reads "Select a building first"
  // even though the restored track came FROM a building. We honor
  // the snapshot only when the user hasn't already selected a
  // different building this session.
  useEffect(() => {
    if (restoredBuildingRef.current) return;
    if (selectedBuilding) { restoredBuildingRef.current = true; return; }
    if (buildings.length === 0) return;
    const snap = getPlayerStateSnapshot();
    if (!snap.currentBuildingId) { restoredBuildingRef.current = true; return; }
    const match = buildings.find((b) => b.id === snap.currentBuildingId);
    if (match) setSelectedBuilding(match);
    restoredBuildingRef.current = true;
  }, [buildings, selectedBuilding]);

  // ── Deep-link auto-select ──
  // When the page is opened with `?building=way/123`, wait for the
  // OSM buildings of the resolved area to load, then look up the
  // matching building and run the same selection path the click
  // handler uses. Strip the param afterwards so a refresh or a
  // manual close-then-reselect doesn't re-trigger the jump.
  const pendingHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingBuildingId) return;
    if (pendingHandledRef.current === pendingBuildingId) return;
    if (buildings.length === 0) return;
    const target = buildings.find((b) => b.id === pendingBuildingId);
    if (!target) return;
    pendingHandledRef.current = pendingBuildingId;
    handleBuildingSelect(target);
    // Drop the URL params so the user lands on a clean `/map`.
    setSearchParams({}, { replace: true });
    // handleBuildingSelect is stable via useCallback; safe to depend on.
  }, [pendingBuildingId, buildings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-play the building's #1 playlist's first preview-able track
  // when the user selects a building. Slight delay (250 ms) gives
  // the seed enricher time to populate previewUrl on the seed
  // tracks (the iTunes search runs async in the background) and
  // matches the panel's slide-in feel — playback starts as the
  // hero card finishes mounting.
  //
  // Dedup guard: keep a ref of the (buildingId, trackId) we last
  // auto-played and skip if both match. Stops the "click same
  // building twice → playPreview's toggle pauses the song"
  // misfire and the "tagger group shuffles → fresh effect run →
  // identical track restarts from 0:00" jank.
  const lastAutoPlayRef = useRef<{ buildingId: string; trackId: string } | null>(null);

  // Shared helper: load `taggerId`'s pinned tracks for `buildingId`
  // into the player queue and start playback from track 0. Used by
  // both the building-select auto-play effect and the rank-row click
  // handler in TopTaggerCard so the two paths stay in lockstep
  // (same queue shape → next/prev keep working when the user pivots
  // from auto-played #1 to a manually-clicked #2 / #3).
  const playTaggerPlaylist = (buildingId: string, taggerId: string): void => {
    const tracks = getTracksByTagger(buildingId, taggerId);
    const queue = tracks
      .filter((tr) => tr.previewUrl)
      .map((tr) => ({
        id: tr.id,
        url: tr.previewUrl,
        meta: {
          title: tr.trackName,
          artist: tr.artistName,
          artworkUrl: tr.artworkUrl || undefined,
          appleUrl: tr.trackViewUrl || undefined,
        },
      }));
    if (queue.length === 0) return;
    setQueue(queue, buildingId);
    const first = queue[0];
    lastAutoPlayRef.current = { buildingId, trackId: first.id };
    playPreview(first.id, first.url, first.meta, { force: true });
  };

  useEffect(() => {
    if (!selectedBuilding) return;
    const id = selectedBuilding.id;
    const t = setTimeout(() => {
      // Honor any explicit play already in-flight for this building
      // (e.g. user clicked a "My Music" item in the left rail, which
      // synchronously called playPreview before this 250 ms timer
      // fired). Don't clobber their queue or restart their track —
      // the rail already loaded what they wanted.
      const snap = getPlayerStateSnapshot();
      if (snap.currentBuildingId === id && snap.currentId && snap.queue.length > 0) {
        return;
      }
      const top = getTopTaggers(id, 1)[0];
      if (!top) return;
      const tracks = getTracksByTagger(id, top.taggerId);
      // Build a queue of every preview-able track from the #1
      // playlist so the NowPlayingBar's prev/next buttons can walk
      // it. The queue is set even when auto-play is a no-op (same
      // building re-click) so the user can still skip from the bar.
      const queue = tracks
        .filter((tr) => tr.previewUrl)
        .map((tr) => ({
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
      setQueue(queue, id);
      const first = queue[0];
      if (!first) return;
      // Building click is itself a user gesture, so the browser
      // permits audio to start within the activation window
      // (~1 s). Always try playPreview — if the browser still
      // rejects (rare: page restored from bf-cache without a fresh
      // gesture), the catch handler in playPreview now keeps the
      // track preloaded in paused state so the bar still shows up
      // and the user just clicks Play. Top playlist plays on
      // EVERY building select — that's the primary engagement
      // hook. We always preload first so the bar appears
      // instantly even before the audio promise settles.
      preloadPreview(first.id, first.url, first.meta);
      const last = lastAutoPlayRef.current;
      if (last && last.buildingId === id && last.trackId === first.id) return;
      lastAutoPlayRef.current = { buildingId: id, trackId: first.id };
      playPreview(first.id, first.url, first.meta);
    }, 250);
    return () => clearTimeout(t);
  }, [selectedBuilding]);

  // Seed demo agent playlists for buildings that have no pins yet,
  // so the UI renders meaningful data before real users tag
  // anything. Idempotent — never overwrites real entries. Runs in
  // production too: VIBLOC has no real-user data yet, the seeded
  // personas ARE the demo content (and the iTunes enricher needs
  // to fire so covers match Apple Music).
  useEffect(() => {
    if (buildings.length === 0) return;
    void import('./features/dev/seedAgents').then(({ seedBuildingPlaylists }) => {
      seedBuildingPlaylists(
        buildings.map((b) => ({
          id: b.id,
          // Building-aware seeding: pass shape so the seeder can vary
          // tracks per building (a tall office tower gets office-vibe
          // music, a low retail block gets cafe-friendly picks).
          height: b.height,
          tagCategories: b.tags?.map((t) => t.category) ?? [],
        })),
        AREA_COUNTRY[area],
      );
      // Kick off the iTunes enrichment pass so the picsum placeholder
      // covers get progressively replaced with real Apple album art
      // (and previewUrl + trackViewUrl) within a few seconds. Cached
      // in localStorage so it's a one-time cost per device.
      void import('./features/dev/enrichSeedArtwork').then(({ enrichSeedArtworkInBackground }) => {
        enrichSeedArtworkInBackground(AREA_COUNTRY[area]);
      });
    });
  }, [buildings, area]);
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

  // Live mirror of the latest selected building. Used by the lock
  // check inside handleBuildingSelect so we always read the CURRENT
  // selection, never a stale closure value. (The previous useCallback
  // closure could fall behind during rapid click bursts — child
  // components like the merged building mesh can fire onClick with
  // an older handler reference before React's re-render replaces it.
  // Using a ref sidesteps that race entirely.)
  const selectedBuildingRef = useRef<OSMBuilding | null>(null);
  useEffect(() => { selectedBuildingRef.current = selectedBuilding; }, [selectedBuilding]);

  const handleBuildingSelect = useCallback((b: OSMBuilding | null) => {
    // ── Selection lock ──
    //   1. Clicking a DIFFERENT building → ignored. Must right-click
    //      to release first.
    //   2. Re-clicking the SAME building (or stray clicks while the
    //      user is left-drag-orbiting) → full no-op so the fly-to
    //      animation never re-fires and yanks the camera back.
    //   3. Explicit deselect (b === null) → always allowed.
    const prev = selectedBuildingRef.current;
    if (b !== null && prev) {
      if (b.id === prev.id) return; // re-click same → no-op
      return;                       // switch attempt → blocked
    }
    setSelectedBuilding(b);
    setGeocodedInfo(null);
    setSanitizedCoord(null);
    if (b) {
      // Mirror the search-bar interaction: building selection (3D click,
      // search, address-jump) flies the camera to a consistent framing.
      // The camera target was previously rooftop-pivoted for the avatar
      // floater; with that gone, framing now lands on the mid-height
      // (see CameraNavigator.targetPos in PlateauScene.tsx).
      handleNavigate([b.center[0], b.center[1]], b.height, b.footprint);

      const config = CITY_AREAS[area];
      const { lat, lon } = metersToLatLon(b.center[0], b.center[1], config.refLat, config.refLon);
      setGeocoding(true);
      reverseGeocode(lat, lon, lang).then((info) => {
        setGeocodedInfo(info);
        setGeocoding(false);
      });
    }
  }, [area, handleNavigate, lang]);

  const handleSearchSelect = useCallback((b: OSMBuilding) => {
    handleBuildingSelect(b);
  }, [handleBuildingSelect]);

  // Forced reselect — used by the left rail "My Music" rows. Even
  // when the same building is already current, we want the full
  // selection cycle (camera animation, panel re-mount, queue reset)
  // to re-fire. setSelectedBuilding(null) → next tick → re-select
  // gives React two distinct commits so all dependent effects run.
  const handleForceReselect = useCallback((b: OSMBuilding) => {
    setSelectedBuilding(null);
    setSanitizedCoord(null);
    window.setTimeout(() => {
      handleBuildingSelect(b);
    }, 0);
  }, [handleBuildingSelect]);

  const handleSunUpdate = useCallback((lightPos: [number, number, number], isDark: boolean) => {
    setSunLightPos(lightPos);
    // Auto-switch dark/light mode based on sun
    if (!manualDarkRef.current) {
      setDarkMode(isDark);
    }
  }, []);

  const handleDarkModeToggle = useCallback(() => {
    // Zustand setter takes a value (no functional updater form), so
    // we read the current snapshot from the store rather than relying
    // on stale closure state.
    const next = !useDarkModeStore.getState().darkMode;
    if (liveTimeEnabled) {
      // In live mode, manual toggle overrides auto — toggle it off on next sun change
      manualDarkRef.current = true;
      setDarkMode(next);
      // Reset manual override after 3 seconds — let sun take over again
      setTimeout(() => { manualDarkRef.current = false; }, 3000);
    } else {
      setDarkMode(next);
    }
  }, [liveTimeEnabled, setDarkMode]);

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
    <div
      style={{ width: '100vw', height: '100vh', position: 'relative' }}
      // Right-click anywhere → deselect the current building. Suppresses
      // the browser context menu so the gesture is purely a "back" /
      // "close panel" affordance. Does not affect any other state
      // (camera, area, area chips, music selection persist).
      onContextMenu={(e) => {
        if (selectedBuilding) {
          e.preventDefault();
          handleBuildingSelect(null);
        }
      }}
    >
      {/* 3D scene stays pinned to the viewport edges. Earlier this
          was wrapped in a translateX to "follow" the rail-aware
          center, but the canvas's own background got dragged off
          the viewport on one side, exposing a black/white strip
          where the body bg showed through. The rails / panels do
          all the centering work; the city itself never moves. */}
      <PlateauScene area={area} navigateTarget={navigateTarget} darkMode={darkMode} sunLightPos={sunLightPos} selectedBuilding={selectedBuilding} onBuildingSelect={handleBuildingSelect} onBuildingsLoaded={setBuildings} onSelectedAnchor={onSelectedAnchor} />

      {/* Global "now playing" bar — fades in when a preview is
          playing. Mounted at the App root so it stays visible even
          when the user closes the building panel mid-track. */}
      <NowPlayingBar
        darkMode={darkMode}
        selectedBuildingId={selectedBuilding?.id ?? null}
        selectedBuildingName={selectedBuilding?.name ?? null}
      />
      {/* Live-time slider — drives sun position + auto dark/light
          mode + city weather glyph. Was implemented + handlers
          wired but the component itself was never mounted, leaving
          the landing page's "real-time sun / weather / charts"
          claim un-fulfilled. Re-mounted 2026-05-05 so the feature
          users were promised actually appears. */}
      <TimeSlider
        area={area}
        enabled={liveTimeEnabled}
        onToggle={handleLiveTimeToggle}
        onSunUpdate={handleSunUpdate}
        darkMode={darkMode}
      />
      {/* WeatherDevToggle hidden from the user-facing UI — it was
          a dev/preview affordance for synthesising rain/snow without
          waiting on Open-Meteo. Live weather pipeline now drives the
          real category, so the manual cycle button is no longer
          surfaced. Kept in the import for quick re-mounting during
          dev work; toggle the JSX comment below to bring it back. */}
      {/* <WeatherDevToggle /> */}
      {/* Symmetric viewport-fixed left rail — restored per user
          request. Hosts the tool cluster (Search / Profile / Cities
          / sticky-bottom Settings) so the corner-scattered chrome
          collapses into a single Apple Music-style nav rail. */}
      <FixedToolSidebar
        area={area}
        onSelectArea={(key) => {
          setArea(key);
          setSelectedBuilding(null);
          setSanitizedCoord(null);
        }}
        darkMode={darkMode}
        onToggleDarkMode={handleDarkModeToggle}
        liveMode={liveTimeEnabled}
        onToggleLiveMode={handleLiveTimeToggle}
        buildings={buildings}
        onSelectBuilding={handleSearchSelect}
        onNavigate={handleNavigate}
        onForceReselect={handleForceReselect}
        onOpenMyDetail={(userId) => setDetailTaggerId(userId)}
      />
      {/* SINGLE right rail. Always FixedQueueSidebar — when a
          building is selected, its `children` slot renders the
          music sections (CityVibe / Search / TopPlaylists /
          TopPicks / MyPlaylist / AI 추천) above the Up Next queue.
          When no building, just the queue (or an empty-state when
          queue is also empty). One mount, one DOM node, no
          conditional surface swap. */}
      <FixedQueueSidebar
        text={darkMode ? '#f5f5f7' : '#0e0e1a'}
        text2={darkMode ? '#c7c7cc' : '#2e2e38'}
        text3={darkMode ? '#8e8e93' : '#5a5a66'}
        divider={darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)'}
        darkMode={darkMode}
        buildingId={selectedBuilding?.id ?? null}
      >
        {selectedBuilding && (() => {
          // Inline-derived locals so the music sections can render
          // outside the IIFE that owns most building state. lat/lon
          // and the simple "real name" check are enough — anything
          // more nuanced is still handled by the chasing left panel.
          const cfg = CITY_AREAS[area];
          const _lat = sanitizedCoord?.lat
            ?? metersToLatLon(selectedBuilding.center[0], selectedBuilding.center[1], cfg.refLat, cfg.refLon).lat;
          const _lon = sanitizedCoord?.lon
            ?? metersToLatLon(selectedBuilding.center[0], selectedBuilding.center[1], cfg.refLat, cfg.refLon).lon;
          const _rawName = (geocodedInfo?.name || selectedBuilding.name || '').trim();
          const _hasRealName = !!_rawName && _rawName !== 'Building';
          const _text  = darkMode ? '#f5f5f7' : '#0e0e1a';
          const _text2 = darkMode ? '#c7c7cc' : '#2e2e38';
          const _text3 = darkMode ? '#8e8e93' : '#5a5a66';
          const _divider = darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
          // When a playlist is opened, the rail SYNCS to that playlist:
          // we swap the multi-section building view for the dedicated
          // PlaylistDetailView (curator profile + name + full track
          // list + Play / Shuffle). Back button returns to the
          // building's music sections.
          if (detailTaggerId) {
            return (
              <PlaylistDetailView
                buildingId={selectedBuilding.id}
                taggerId={detailTaggerId}
                text={_text} text2={_text2} text3={_text3} divider={_divider}
                onBack={() => setDetailTaggerId(null)}
              />
            );
          }
          return (
            <>
              {/* Right-rail order — design pass 2026-05-06:
                    1. AddTrackComposer  — search to add new pins
                    2. MY PLAYLIST       — promoted to the top so the
                                           user's own list reads as
                                           the primary surface
                    3. TOP PLAYLISTS     — curator list (taggers)
                    4. TOP PICKS         — popular tracks here
                    5. AI 추천곡         — recommendations
                  Was MY PLAYLIST sitting between TOP PICKS and
                  RecommendedList — buried below two community-
                  scope sections. Surfacing it first matches the
                  "my space first, community second" hierarchy. */}
              <AddTrackComposer
                buildingId={selectedBuilding.id}
                vibe={getCityVibe(area)}
                text={_text} text2={_text2} text3={_text3} divider={_divider}
                onOpenPlaylist={(id) => setDetailTaggerId(id)}
              />
              <BuildingPlaylist
                buildingId={selectedBuilding.id}
                cityVibe={getCityVibe(area)}
                text={_text} text2={_text2} text3={_text3} divider={_divider}
                darkMode={darkMode}
                onOpenDetail={(id) => setDetailTaggerId(id)}
              />
              <TopTaggerCard
                buildingId={selectedBuilding.id}
                text={_text} text2={_text2} text3={_text3} divider={_divider}
                onSelect={(id) => setDetailTaggerId(id)}
                onPlay={(id) => playTaggerPlaylist(selectedBuilding.id, id)}
              />
              <PopularTrackCard
                buildingId={selectedBuilding.id}
                text={_text} text2={_text2} text3={_text3} divider={_divider}
              />
              <RecommendedList
                area={area}
                lat={_lat} lon={_lon}
                buildingName={_hasRealName ? _rawName : null}
                buildingId={selectedBuilding.id}
                buildingTags={selectedBuilding.tags}
                text={_text} text2={_text2} text3={_text3} divider={_divider}
              />
            </>
          );
        })()}
      </FixedQueueSidebar>

      {/* Scattered chrome consolidated into FixedToolSidebar (2026-04-29). chasing PLACE panel intentionally untouched. */}

      <CanvasTour darkMode={darkMode} />
      <OnboardingCoachmark darkMode={darkMode} />

      <div
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          padding: '8px 16px',
          borderRadius: 12,
          background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(20px)',
          fontFamily: FONT.mono,
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
        //     Light: #0e0e1a on #f5f5f7 ≈ 14.3:1, #2e2e38 on #f5f5f7 ≈ 8.3:1,
        //           #5a5a66 on #f5f5f7 ≈ 5.7:1.
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
        const text    = darkMode ? '#f5f5f7' : '#0e0e1a';   // ≥14:1 — body & headlines
        const text2   = darkMode ? '#c7c7cc' : '#2e2e38';   // ≥8:1 — secondary body
        const text3   = darkMode ? '#8e8e93' : '#5a5a66';   // ≥5:1 — only used at ≥12px bold
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
        // Mirror final count into the ref read by the panel-target
        // compute hook so the panel lifts higher when the list is long.
        tenantCountRef.current = allTenantsList.length;
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
              // 320 px target, but never wider than 40 % of the
              // space remaining between the two rails so the panel
              // doesn't get pushed offscreen when the user drags a
              // rail wider. Scales DOWN proportionally; the rAF
              // anchor logic handles X position.
              width: 'min(320px, calc((100vw - var(--vbk-left-rail-w, 280px) - var(--vbk-right-rail-w, 280px)) * 0.45))',
              // Floating panels stay anchored to their building via
              // the rAF projection. They don't shift with rail width
              // because the 3D scene also doesn't shift; otherwise
              // the panel would drift off its anchor.
              transition: 'width 160ms ease',
              // Outer wrapper does NOT clip — the soft blur child below
              // extends past the visible panel on purpose so the mask
              // can fade outside the content area.
              overflow: 'visible',
              zIndex: 30,
              // The rAF loop writes `transform: scale(...)` here.
              // Origin = top right so as the panel shrinks (zoom-out)
              // it collapses TOWARD the building (which sits to the
              // right of the panel in the dominant left-side
              // placement), preserving the "upper-left of building"
              // anchor feel at every zoom level.
              transformOrigin: 'top right',
              willChange: 'transform, top, left',
            }}
          >
            {/* Edgeless backdrop blur — sits behind the panel content
                with no border, no fill, no visible boundary. The mask
                is a soft radial gradient so the blur fades to clear at
                the edges, creating a halo effect around the text
                without ever drawing a hard rectangle. */}
            {(() => {
              // ─────────────────────────────────────────────────────
              // Progressive (gradient) blur halo — color-free, edgeless
              // ─────────────────────────────────────────────────────
              //
              // Research (kennethnym.com "Progressive blur in CSS",
              // devslovecoffee.com "Apple progressive blur on web",
              // Smashing Magazine "CSS Blurry Shimmer Effect"):
              //
              // A SINGLE backdrop-filter element — no matter how soft
              // the mask — has exactly one alpha falloff curve. The
              // human eye picks that curve up as a halo edge, even
              // when intellectually the boundary is "soft". The
              // industry-standard fix is **stacked layers of blur**,
              // each with a progressively stronger blur radius and
              // a smaller visible region. Because the layers are
              // NESTED, every child's backdrop is the parent's already
              // blurred output, so the blur strength compounds toward
              // the center while the OUTER region only ever receives
              // the weakest layer. Result: a smooth gradient of blur
              // intensity from "no blur" at the very edge to "strong
              // blur" at the centre — no single boundary to register.
              //
              // No `background` color anywhere → fully translucent.
              // No JS, no remote URLs, no user-input in style strings
              // → CSP-safe / injection-safe.
              const FEATHER = 100; // px soft-fade band on every side
              // Per-layer feather (gradient transition distance). Each
              // inner layer fades earlier so its blur is concentrated
              // toward the centre; the outer layer carries the soft
              // edge alone.
              const featherFor = (px: number) => `transparent 0,
                black ${px}px,
                black calc(100% - ${px}px),
                transparent 100%`;
              const softMask = (px: number) =>
                `linear-gradient(to bottom, ${featherFor(px)}),
                 linear-gradient(to right,  ${featherFor(px)})`;
              const maskCommon = {
                maskComposite: 'intersect' as const,
                WebkitMaskComposite: 'source-in' as const,
              };
              // Three nested layers. Blur compounds because each
              // child's backdrop is the parent's already-blurred output.
              // Total at centre ≈ blur(3) + blur(7) + blur(14) → very
              // soft frosted; at edge only blur(3) is active → barely
              // perceptible, indistinguishable from "no blur".
              return (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top:    -FEATHER,
                    left:   -FEATHER,
                    right:  -FEATHER,
                    bottom: -FEATHER,
                    pointerEvents: 'none',
                    zIndex: -1,
                    // L1 — outermost, weakest blur, widest visible area.
                    backdropFilter: 'blur(3px)',
                    WebkitBackdropFilter: 'blur(3px)',
                    maskImage: softMask(FEATHER),
                    WebkitMaskImage: softMask(FEATHER),
                    ...maskCommon,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: FEATHER * 0.25,
                      pointerEvents: 'none',
                      // L2 — middle, medium blur, medium area.
                      backdropFilter: 'blur(7px)',
                      WebkitBackdropFilter: 'blur(7px)',
                      maskImage: softMask(FEATHER * 0.7),
                      WebkitMaskImage: softMask(FEATHER * 0.7),
                      ...maskCommon,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: FEATHER * 0.25,
                        pointerEvents: 'none',
                        // L3 — innermost, strongest blur, smallest area
                        // (sits over the panel content only).
                        backdropFilter: 'blur(14px)',
                        WebkitBackdropFilter: 'blur(14px)',
                        maskImage: softMask(FEATHER * 0.5),
                        WebkitMaskImage: softMask(FEATHER * 0.5),
                        ...maskCommon,
                      }}
                    />
                  </div>
                </div>
              );
            })()}
            {/* Scrollable content layer — sits on top of the blur halo.
                Height locked to PANEL_CONTENT_H so the left and right
                floating panels always render at the SAME visible
                height; whichever panel has overflow scrolls inside.
                Padding mirrors PANEL_INNER_PAD so the PLACE eyebrow
                lines up with MUSIC on the right panel — same top
                inset, same horizontal indent. */}
            <div
              style={{
                position: 'relative',
                height: PANEL_CONTENT_H,
                overflowY: 'auto',
                padding: PANEL_INNER_PAD,
                // Body uses sans-serif (FONT.ui) to match the rail
                // panels' design vocabulary. Mono is reserved for
                // technical metadata (height "m", floors "F", OSM
                // attribution) where tabular alignment matters.
                fontFamily: FONT.ui,
                color: text,
                display: 'flex',
                flexDirection: 'column',
                textShadow: darkMode
                  ? '0 1px 2px rgba(0,0,0,0.6)'
                  : '0 1px 2px rgba(255,255,255,0.7)',
              }}
            >
            <div style={{
              ...SECTION_HEADER, color: text3, marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <span aria-hidden="true" style={{
                width: 6, height: 6, borderRadius: '50%',
                background: darkMode ? '#ec4899' : '#db2777', flexShrink: 0,
              }}/>
              {t('panel.place')}
            </div>

            {/* Kicker — Apple "Subhead" spec (15/600/-0.014em). Was
                13/600 with raw 0.1px tracking; bumped one step so it
                reads as the structured prefix to the headline below. */}
            {kicker ? (
              <div style={{
                fontSize: 15, fontWeight: 600, letterSpacing: '-0.014em',
                color: text2, marginBottom: 4, lineHeight: 1.33,
                wordBreak: 'break-word',
              }}>{kicker}</div>
            ) : null}

            {/* Headline — Apple Title 2 spec (22/700/-0.005em/1.16).
                Was 17 or 20 with raw -0.3 px tracking. Title 2 is
                Apple's standard for "primary content title" in a
                detail panel (e.g. Maps Place Card title). */}
            <div style={{
              fontSize: kicker ? 19 : 22, fontWeight: 700,
              letterSpacing: '-0.005em', lineHeight: 1.16,
              color: text, wordBreak: 'break-word',
            }}>{title}</div>

            {/* Building stats row — height + floors + skyscraper
                badge. All elements share the same 11/600/0.06em
                eyebrow spec for typographic alignment with the
                rest of the rail's small-caps labels. */}
            {(selectedBuilding.height > 0 || selectedBuilding.levels > 0 || isSkyscraper) ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {(selectedBuilding.height > 0 || selectedBuilding.levels > 0) ? (
                  <span style={{
                    fontSize: 11, color: text2, fontWeight: 600,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    fontFamily: FONT.mono,
                  }}>
                    {selectedBuilding.height > 0 ? `${Math.round(selectedBuilding.height)} m` : ''}
                    {selectedBuilding.height > 0 && selectedBuilding.levels > 0 ? ' · ' : ''}
                    {selectedBuilding.levels > 0 ? `${selectedBuilding.levels} F` : ''}
                  </span>
                ) : null}
                {isSkyscraper ? (
                  <span style={{
                    padding: '3px 10px', borderRadius: 999,
                    background: darkMode ? 'rgba(129,140,248,0.18)' : 'rgba(99,102,241,0.12)',
                    color: darkMode ? '#a5b4fc' : '#4f46e5',
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontFamily: FONT.mono,
                    border: darkMode ? '1px solid rgba(165,180,252,0.25)' : '1px solid rgba(99,102,241,0.25)',
                    textShadow: 'none',
                  }}>{t('panel.skyscraper')}</span>
                ) : null}
              </div>
            ) : null}

            {geocoding && !kicker ? (
              <div style={{
                fontSize: 13, color: text2, marginTop: 10,
                letterSpacing: '-0.01em',
              }} aria-live="polite">
                {t('panel.loadingAddr')}
              </div>
            ) : null}

            {/* Map deeplinks — single unified Maps toggle.
                Click → fans the destinations sideways. Apple body
                caption spec (12 / 500 / -0.01em) replaces the
                heavier mono 11/700/0.4px so the pills sit on the
                same baseline as the rest of the rail's body text. */}
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 16 }}>
              {(() => {
                const ghostBtn: React.CSSProperties = {
                  fontFamily: FONT.ui,
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                  padding: '6px 12px',
                  borderRadius: 999,
                  textDecoration: 'none',
                  color: text,
                  background: darkMode ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.5)',
                  border: `1px solid ${divider}`,
                  whiteSpace: 'nowrap',
                  textShadow: 'none',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                };
                const opts: { label: string; href: string }[] = [];
                opts.push({ label: 'Google', href: _lGURL });
                opts.push({ label: 'Apple', href: _lAURL });
                if (_lNaverURL) opts.push({ label: '네이버', href: _lNaverURL });
                if (_lKakaoURL) opts.push({ label: '카카오', href: _lKakaoURL });
                if (_lYahooURL) opts.push({ label: 'Yahoo!地図', href: _lYahooURL });
                if (_lBingURL)  opts.push({ label: 'Bing', href: _lBingURL });
                return <MapsToggle options={opts} ghostBtn={ghostBtn} lang={lang} />;
              })()}
            </div>

            {/* Street View — compact launcher.
                Apple Caption 1 spec (12 / 500 / -0.01em). Was a
                heavier mono uppercase chip (12/700/0.6px) that
                visually dominated the rail; toned down so it reads
                as a secondary affordance. Pill radius (999) matches
                the Maps deeplinks above for consistency. */}
            {!streetViewExpanded ? (
              <button
                type="button"
                onClick={() => setStreetViewExpanded(true)}
                style={{
                  marginTop: 12, width: '100%', padding: '11px 14px',
                  borderRadius: 999, border: `1px dashed ${divider}`,
                  background: darkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)',
                  backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                  fontFamily: FONT.ui, fontSize: 12, fontWeight: 500,
                  letterSpacing: '-0.01em', color: text2,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8, textShadow: 'none',
                }}
              >
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

            {/* ── Tenant list (moved from right panel) ──
                Hairline removed; gap-only separation matches the
                rest of the panels (Apple Settings / Music modern
                borderless stack). */}
            {allTenantsList.length > 0 && (
              <div style={{
                marginTop: 24,
              }}>
                <div style={{
                  // SECTION_HEADER token — single source of small
                  // caps so this header always tracks the rest of
                  // the rail when the spec evolves.
                  ...SECTION_HEADER, color: text3, marginBottom: 8,
                }}>
                  {t('panel.tenants') || '입점 정보'}
                </div>
                <div
                  role="list"
                  aria-label="Tenants"
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 2,
                    // Cap height past N tenants and let the inner list
                    // scroll. fadeMask hints at clipped content.
                    maxHeight: allTenantsList.length > TENANT_SCROLL_AFTER
                      ? TENANT_SCROLL_MAX_PX : undefined,
                    overflowY: allTenantsList.length > TENANT_SCROLL_AFTER
                      ? 'auto' : undefined,
                    paddingRight: allTenantsList.length > TENANT_SCROLL_AFTER ? 4 : 0,
                    maskImage: allTenantsList.length > TENANT_SCROLL_AFTER
                      ? 'linear-gradient(to bottom, black 92%, transparent)' : undefined,
                    WebkitMaskImage: allTenantsList.length > TENANT_SCROLL_AFTER
                      ? 'linear-gradient(to bottom, black 92%, transparent)' : undefined,
                  }}
                >
                  {allTenantsList.map((tenant, i) => {
                    const s = swatch(tenant.category);
                    // Brand logos dropped — every tenant now uses the
                    // category Lucide icon as a small pictogram so the
                    // tenant rail reads as a uniform list, not a mix
                    // of corporate brand marks.
                    const gURL = tenantClickUrl(tenant, buildingLat, buildingLon);
                    return (
                      <a
                        key={`${tenant.category}-${tenant.name}-${i}`}
                        role="listitem"
                        href={gURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${tenant.name} in Google Maps`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 8px',
                          borderRadius: 8,
                          background: 'transparent',
                          border: 'none',
                          textDecoration: 'none',
                          color: 'inherit',
                          transition: reducedMotion ? 'none' : 'background 150ms ease',
                          cursor: 'pointer',
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
                            width: 36, height: 36, borderRadius: 8,
                            // Always paint the swatch fill — even when a
                            // logo loads on top — so transparent / partial
                            // PNGs don't reveal the panel halo behind.
                            background: s.fill,
                            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, overflow: 'hidden',
                            position: 'relative',
                          }}
                        >
                          {(() => {
                            const Icon = CATEGORY_ICON[tenant.category] ?? MapPin;
                            return (
                              <span style={{
                                display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                color: s.icon,
                              }}>
                                <Icon size={18} strokeWidth={2.2} />
                              </span>
                            );
                          })()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {(() => {
                            // i18n consistency: when the tenant has no
                            // real brand name (name == generic label),
                            // show the translated label as the title so
                            // the row reads in the user's language.
                            // Real brand names (Blue Bottle Coffee /
                            // 무지 / etc.) are kept verbatim.
                            const translated = translateTagLabel(tenant.label, lang);
                            const isGeneric = tenant.name.trim().toLowerCase()
                                              === tenant.label.trim().toLowerCase();
                            const title = isGeneric ? translated : tenant.name;
                            return (
                              <>
                                {/* Tenant name — Apple body row spec:
                                    13 / 600 / -0.01em / line 1.3.
                                    Tracks letter-spacing with the
                                    rest of the rail's row body. */}
                                <div title={tenant.name} style={{
                                  fontSize: 13, fontWeight: 600,
                                  letterSpacing: '-0.01em', color: text,
                                  lineHeight: 1.3,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{title}</div>
                                {/* Category subtitle — Apple Caption 2
                                    spec (11 / 400 / -0.01em). Was an
                                    aggressive uppercase 10/600/0.3 px
                                    label that competed with the row's
                                    primary text. */}
                                <div style={{
                                  fontSize: 11, fontWeight: 400,
                                  letterSpacing: '-0.01em',
                                  color: text3, marginTop: 2,
                                  lineHeight: 1.3,
                                }}>{translated}</div>
                              </>
                            );
                          })()}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
            </div>{/* /scrollable content layer */}
          </div>
        ) : null;

        // ── RIGHT PLAYLISTS PANEL (desktop only) ──────────────────────
        // Restored 2026-04-29 by user request. The chasing rail
        // anchored to the building shows its music context
        // (Featured / Top Playlists / My Playlist). The viewport-
        // fixed FixedQueueSidebar at the App root holds the GLOBAL
        // queue — they coexist without duplication because the
        // sidebar shows building info only when its building prop
        // is null'd here (see FixedQueueSidebar wiring below).
        const rightPanel = !isMobile ? (
          <div
            ref={rightPanelRef}
            style={{
              position: 'fixed',
              top: '38%',
              left: 360,                   // overwritten by rAF tick
              // Same scale-with-rails clamp as leftPanel — width
              // shrinks proportionally as either rail grows so the
              // floating panel never gets clipped behind a wider
              // sidebar.
              width: 'min(320px, calc((100vw - var(--vbk-left-rail-w, 280px) - var(--vbk-right-rail-w, 280px)) * 0.45))',
              // Floating panels stay anchored to their building via
              // the rAF projection. They don't shift with rail width
              // because the 3D scene also doesn't shift; otherwise
              // the panel would drift off its anchor.
              transition: 'width 160ms ease',
              overflow: 'visible',
              zIndex: 30,
              transformOrigin: 'top left',
              willChange: 'transform, top, left',
            }}
          >
            {/* Progressive-blur halo (matches leftPanel) */}
            {(() => {
              const FEATHER = 100;
              const featherFor = (px: number) => `transparent 0,
                black ${px}px,
                black calc(100% - ${px}px),
                transparent 100%`;
              const softMask = (px: number) =>
                `linear-gradient(to bottom, ${featherFor(px)}),
                 linear-gradient(to right,  ${featherFor(px)})`;
              const maskCommon = {
                maskComposite: 'intersect' as const,
                WebkitMaskComposite: 'source-in' as const,
              };
              return (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    inset: `-${FEATHER}px`,
                    borderRadius: 28,
                    pointerEvents: 'none',
                    zIndex: -1,
                    backdropFilter: 'blur(3px)',
                    WebkitBackdropFilter: 'blur(3px)',
                    maskImage: softMask(FEATHER),
                    WebkitMaskImage: softMask(FEATHER),
                    ...maskCommon,
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    inset: `${FEATHER * 0.3}px`,
                    backdropFilter: 'blur(7px)',
                    WebkitBackdropFilter: 'blur(7px)',
                    maskImage: softMask(70),
                    WebkitMaskImage: softMask(70),
                    ...maskCommon,
                  }}>
                    <div style={{
                      position: 'absolute',
                      inset: `${FEATHER * 0.5}px`,
                      backdropFilter: 'blur(14px)',
                      WebkitBackdropFilter: 'blur(14px)',
                      maskImage: softMask(50),
                      WebkitMaskImage: softMask(50),
                      ...maskCommon,
                    }} />
                  </div>
                </div>
              );
            })()}

            <div style={{
              position: 'relative',
              height: PANEL_CONTENT_H,
              overflowY: 'auto',
              padding: PANEL_INNER_PAD,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              {/* MUSIC eyebrow — pairs with leftPanel's PLACE.
                  SECTION_HEADER token keeps it in sync with every
                  other small-caps header on the rail. */}
              <div style={{
                ...SECTION_HEADER, color: text3,
                display: 'flex', alignItems: 'center', gap: 7,
              }}>
                <span aria-hidden="true" style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: darkMode ? '#34d399' : '#10b981',
                  flexShrink: 0,
                }}/>
                {t('panel.music')}
              </div>
              <FeaturedPlaylistHero
                buildingId={selectedBuilding.id}
                text={text}
                text2={text2}
                text3={text3}
                divider={divider}
                onSelect={(id) => setDetailTaggerId(id)}
              />
              <TopTaggerCard
                buildingId={selectedBuilding.id}
                text={text}
                text2={text2}
                text3={text3}
                divider={divider}
                onSelect={(id) => setDetailTaggerId(id)}
                onPlay={(id) => playTaggerPlaylist(selectedBuilding.id, id)}
                limit={3}
                medals
              />
              <BuildingPlaylist
                buildingId={selectedBuilding.id}
                cityVibe={getCityVibe(area)}
                text={text}
                text2={text2}
                text3={text3}
                divider={divider}
                darkMode={darkMode}
                onOpenDetail={(id) => setDetailTaggerId(id)}
              />
            </div>
          </div>
        ) : null;

        // Both panels render — chasing PLACE (left, building info:
        // address / tenants / Street View) + chasing rightPanel
        // (TOP PLAYLISTS medal callout). They share the building
        // anchor with the right FixedQueueSidebar but the content is
        // disjoint (place vs music), so all three coexist.
        return (
          <>
          {leftPanel}
          {rightPanel}
          </>
        );
      })()}
      {/* Toast host — bottom-center HUD for status messages like
          "Already in your playlist". Mounts once at the app root so
          toasts are global and never get clipped by sidebar overflow. */}
      <ToastHost />
    </div>
  );
}

export default App;
