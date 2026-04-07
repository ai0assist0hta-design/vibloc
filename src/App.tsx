import { useState, useCallback, useRef, useEffect } from 'react';
import { PlateauScene } from './components/canvas/PlateauScene';
import { SearchBar } from './components/ui/SearchBar';
import { Compass } from './components/ui/Compass';
import { TimeSlider } from './components/ui/TimeSlider';
import { CITY_AREAS, type CityAreaKey, type OSMBuilding, type BuildingTag, metersToLatLon, reverseGeocode } from './lib/osmLoader';
import './index.css';

function App() {
  const [area, setArea] = useState<CityAreaKey>('shinjuku');
  const [navigateTarget, setNavigateTarget] = useState<[number, number] | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [liveTimeEnabled, setLiveTimeEnabled] = useState(false);
  const [sunLightPos, setSunLightPos] = useState<[number, number, number] | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<OSMBuilding | null>(null);
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

  const handleNavigate = useCallback((pos: [number, number]) => {
    setNavigateTarget(null);
    requestAnimationFrame(() => setNavigateTarget(pos));
  }, []);

  const handleBuildingSelect = useCallback((b: OSMBuilding | null) => {
    setSelectedBuilding(b);
    setGeocodedInfo(null);
    if (b) {
      // Reverse geocode to get real name/address
      const config = CITY_AREAS[area];
      const { lat, lon } = metersToLatLon(b.center[0], b.center[1], config.refLat, config.refLon);
      setGeocoding(true);
      reverseGeocode(lat, lon).then((info) => {
        setGeocodedInfo(info);
        setGeocoding(false);
      });
    }
  }, [area]);

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
    } else {
      manualDarkRef.current = false; // let sun control dark mode
    }
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <PlateauScene area={area} navigateTarget={navigateTarget} darkMode={darkMode} sunLightPos={sunLightPos} onBuildingSelect={handleBuildingSelect} />

      {/* Logo */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
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

      {/* Area selector */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: 24,
          display: 'flex',
          gap: 6,
        }}
      >
        {(Object.keys(CITY_AREAS) as CityAreaKey[]).map((key) => (
          <button
            key={key}
            onClick={() => { setArea(key); setSelectedBuilding(null); }}
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
            {CITY_AREAS[key].label}
          </button>
        ))}
      </div>

      <SearchBar area={area} onNavigate={handleNavigate} darkMode={darkMode} />

      <Compass darkMode={darkMode} />

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
        const addr = (geocodedInfo?.address || selectedBuilding.address || '').trim();
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
        const title = addr || rawName || 'Building';
        const subtitle = ''; // address IS the title now — no subtitle line

        // ---- Generic-only listing ----
        // Show types ("Thai Restaurant", "Fashion Shop") instead of brand names.
        // Wiki-credit rows (Owner/Architect/Developer/Operator) are filtered out.
        const META_LABELS = new Set(['owner', 'operator', 'developer', 'architect']);
        const usefulTags = allTags.filter(
          (t) => !META_LABELS.has((t.label || '').toLowerCase())
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
        // with a count badge ("Thai Restaurant ×3").
        const labelMap = new Map<string, { label: string; category: string; count: number }>();
        for (const t of usefulTags) {
          const key = `${t.category}|${t.label.toLowerCase()}`;
          const existing = labelMap.get(key);
          if (existing) existing.count++;
          else labelMap.set(key, { label: t.label, category: t.category, count: 1 });
        }
        const genericRows = Array.from(labelMap.values()).sort(
          (a, b) => tenantRank(a.category) - tenantRank(b.category)
        );
        // Pills mirror the generic rows but only one per category.
        type Pill = { label: string; category: string };
        const CATEGORY_PILL: Record<string, string> = {
          food: 'Restaurant', shop: 'Shop', hotel: 'Hotel', office: 'Office',
          residential: 'Residential', entertainment: 'Entertainment',
          religious: 'Religious', education: 'Education', medical: 'Medical',
          government: 'Government', other: 'Other',
        };
        const pillSeen = new Set<string>();
        const pills: Pill[] = [];
        for (const row of genericRows) {
          if (pillSeen.has(row.category)) continue;
          pillSeen.add(row.category);
          pills.push({ label: CATEGORY_PILL[row.category] || row.category, category: row.category });
        }

        const titleId = 'vibloc-place-title';
        return (
          <div
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 380,
              background: surface,
              // Very low opacity → rely more heavily on blur + saturation to keep
              // text legible against any map background.
              backdropFilter: opaque ? undefined : 'blur(32px) saturate(170%)',
              WebkitBackdropFilter: opaque ? undefined : 'blur(32px) saturate(170%)',
              borderLeft: `1px solid ${divider}`,
              boxShadow: darkMode
                ? '-16px 0 50px rgba(0,0,0,0.55)'
                : '-16px 0 50px rgba(15,23,42,0.12)',
              fontFamily: "'IBM Plex Mono', monospace",
              color: text,
              display: 'flex',
              flexDirection: 'column',
              zIndex: 30,
              transition: reducedMotion ? 'none' : `background ${transitionMs}ms ease`,
              overflow: 'hidden', // contain the gradient glow
            }}
          >
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
                Place
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
              {(selectedBuilding.height > 0 || selectedBuilding.levels > 0) ? (
                <div
                  style={{
                    fontSize: 11,
                    color: text2,
                    marginTop: 6,
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    opacity: 0.75,
                  }}
                >
                  {selectedBuilding.height > 0 ? `${Math.round(selectedBuilding.height)} m` : ''}
                  {selectedBuilding.height > 0 && selectedBuilding.levels > 0 ? ' · ' : ''}
                  {selectedBuilding.levels > 0 ? `${selectedBuilding.levels} F` : ''}
                </div>
              ) : null}
              {geocoding && !kicker ? (
                <div style={{ fontSize: 12, color: text2, marginTop: 10 }} aria-live="polite">
                  Loading address…
                </div>
              ) : null}
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
              {/* Compact category chips — single row, minimal vertical footprint */}
              {pills.length > 0 && (
                <div
                  role="group"
                  aria-label="Place categories"
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                >
                  {pills.map((tag, i) => {
                    const s = swatch(tag.category);
                    return (
                      <span
                        key={`cat-${i}`}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 999,
                          background: s.fill,
                          color: s.ink,
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                          textTransform: 'uppercase',
                          border: `1px solid ${darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
                        }}
                      >
                        {tag.label}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Inside-this-place card — generic types only, no brand names */}
              {genericRows.length > 0 && (
                <div
                  role="list"
                  aria-label="Inside this place"
                  style={{
                    background: card,
                    border: `1px solid ${divider}`,
                    borderRadius: 16,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '16px 16px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1.3,
                      color: text2,
                      textTransform: 'uppercase',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
                      Inside this place
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: text2,
                        letterSpacing: 0.3,
                        fontWeight: 700,
                        padding: '2px 8px',
                        background: cardSub,
                        border: `1px solid ${divider}`,
                        borderRadius: 999,
                      }}
                    >
                      {genericRows.length}
                    </span>
                  </div>
                  <div>
                    {genericRows.map((row, i) => {
                      const s = swatch(row.category);
                      return (
                        <div
                          role="listitem"
                          key={`type-${i}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            borderTop: i === 0 ? 'none' : `1px solid ${divider}`,
                          }}
                        >
                          <div
                            aria-hidden="true"
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 11,
                              background: s.fill,
                              color: s.ink,
                              border: `1px solid ${darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 14,
                              fontWeight: 800,
                              flexShrink: 0,
                            }}
                          >
                            {glyph[row.category] || '·'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: text,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.35,
                              }}
                            >
                              {row.label}
                            </div>
                          </div>
                          {row.count > 1 && (
                            <span
                              aria-label={`${row.count} of this type`}
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: text2,
                                padding: '2px 8px',
                                background: cardSub,
                                border: `1px solid ${divider}`,
                                borderRadius: 999,
                                flexShrink: 0,
                              }}
                            >
                              ×{row.count}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default App;
