import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { geocodeAddress, geoToLocalMeters } from '../../lib/geocoder';
import { CITY_AREAS, type CityAreaKey, type OSMBuilding } from '../../lib/osmLoader';
import { resolveJPBuilding } from '../../lib/jpAddressResolver';
import { resolveKRBuilding } from '../../lib/krAddressResolver';
import { useT } from '../../lib/i18n';
import { rankBuildings, type RankedResult } from '../../lib/searchEngine';

type SearchBarProps = {
  area: CityAreaKey;
  buildings: OSMBuilding[];
  onSelectBuilding: (b: OSMBuilding) => void;
  onNavigate: (position: [number, number]) => void;
  darkMode?: boolean;
};

/**
 * The actual ranking + fuzzy matching + synonyms + popularity all live in
 * `lib/searchEngine.ts`. This component just calls into it for both the
 * full search (Enter / Go) and the live autocomplete dropdown.
 */
const AUTOCOMPLETE_MAX = 6;
const AUTOCOMPLETE_DEBOUNCE_MS = 120;

export function SearchBar({ area, buildings, onSelectBuilding, onNavigate, darkMode = false }: SearchBarProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // --- Autocomplete state ---
  const [suggestions, setSuggestions] = useState<RankedResult[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Memoize the index reference. The ranker is fast enough that we
  // don't need to precompute per-building docs across renders, but we
  // do want a stable reference so the debounce effect doesn't re-fire
  // every parent render.
  const index = useMemo(() => buildings, [buildings]);

  // Debounced live autocomplete. Re-runs whenever the query or the
  // building set changes (e.g. user switched cities mid-typing).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || index.length === 0) {
      setSuggestions([]);
      setHighlight(-1);
      return;
    }
    const handle = window.setTimeout(() => {
      const ranked = rankBuildings(q, index, { limit: AUTOCOMPLETE_MAX });
      setSuggestions(ranked);
      setHighlight(ranked.length > 0 ? 0 : -1);
    }, AUTOCOMPLETE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, index]);

  const selectFromList = useCallback((b: OSMBuilding) => {
    onSelectBuilding(b);
    setResult(b.address || b.name || 'Selected');
    setOpen(false);
    setSuggestions([]);
    setHighlight(-1);
  }, [onSelectBuilding]);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setResult(null);
    setOpen(false);

    // 1) Local rank against loaded buildings via the search engine
    //    (field-weighted + fuzzy + synonyms + popularity + provenance).
    const ranked = rankBuildings(q, index, { limit: 1 });
    if (ranked.length > 0) {
      const best = ranked[0].building;
      onSelectBuilding(best);
      setResult(best.address || best.name || 'Selected');
      setLoading(false);
      setSuggestions([]);
      return;
    }

    // 2) JP fallback: resolve via verified Geolonia town/chome centroids
    //    (build-time data, served from our own origin) → snap to nearest
    //    building. Zero runtime third-party calls.
    if (area === 'shinjuku' || area === 'shibuya') {
      const config = CITY_AREAS[area];
      const jpBuilding = await resolveJPBuilding(
        area,
        q,
        index,
        config.refLat,
        config.refLon,
      );
      if (jpBuilding) {
        onSelectBuilding(jpBuilding);
        setResult(jpBuilding.address || jpBuilding.name || 'Selected');
        setLoading(false);
        return;
      }
    }

    // 2b) KR fallback: resolve via verified OSM dong/neighbourhood centroids
    //     (build-time data, served from our own origin) → snap to nearest
    //     building. Zero runtime third-party calls.
    if (area === 'itaewon' || area === 'gangnam') {
      const config = CITY_AREAS[area];
      const krBuilding = await resolveKRBuilding(
        area,
        q,
        index,
        config.refLat,
        config.refLon,
      );
      if (krBuilding) {
        onSelectBuilding(krBuilding);
        setResult(krBuilding.address || krBuilding.name || 'Selected');
        setLoading(false);
        return;
      }
    }

    // 3) Fallback: external geocoder → just pan camera (no selection)
    const geo = await geocodeAddress(q);
    if (!geo) {
      setResult(t('search.notFound'));
      setLoading(false);
      return;
    }

    const config = CITY_AREAS[area];
    const [x, z] = geoToLocalMeters(geo.lat, geo.lon, config.refLat, config.refLon);
    onNavigate([x, z]);
    setResult(geo.displayName.split(',').slice(0, 3).join(','));
    setLoading(false);
  }, [query, area, index, onSelectBuilding, onNavigate]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        right: 76,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'flex-end',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 6,
          background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 14,
          padding: '6px 8px',
          boxShadow: darkMode ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.08)',
          transition: 'all 0.4s ease',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so that mousedown on a suggestion fires before we hide.
            window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              if (suggestions.length === 0) return;
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => (h + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp') {
              if (suggestions.length === 0) return;
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (open && highlight >= 0 && suggestions[highlight]) {
                selectFromList(suggestions[highlight].building);
              } else {
                handleSearch();
              }
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={t('search.placeholder')}
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="vibloc-search-suggestions"
          aria-activedescendant={highlight >= 0 ? `vibloc-sugg-${highlight}` : undefined}
          style={{
            width: 200,
            padding: '6px 12px',
            border: 'none',
            background: 'transparent',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            color: darkMode ? '#e0e0e8' : '#1a1a2e',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          style={{
            padding: '6px 14px',
            borderRadius: 10,
            border: 'none',
            background: darkMode ? '#e0e0e8' : '#1a1a2e',
            color: darkMode ? '#0a0a0f' : '#fff',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'all 0.4s ease',
          }}
        >
          {loading ? '...' : t('search.go')}
        </button>
      </div>
      {open && suggestions.length > 0 && (
        <ul
          id="vibloc-search-suggestions"
          role="listbox"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 4,
            width: 320,
            maxHeight: 280,
            overflowY: 'auto',
            background: darkMode ? 'rgba(20,20,28,0.92)' : 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 12,
            boxShadow: darkMode
              ? '0 12px 32px rgba(0,0,0,0.45)'
              : '0 12px 32px rgba(15,23,42,0.14)',
            border: darkMode ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.06)',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {suggestions.map((s, i) => {
            const b = s.building;
            const isActive = i === highlight;
            const primary = (b.name && b.name !== b.address ? b.name : b.address) || 'Building';
            const secondary = b.name && b.name !== b.address ? b.address : '';
            const meta = [
              b.levels ? `${b.levels}F` : '',
              b.height ? `${Math.round(b.height)}m` : '',
            ].filter(Boolean).join(' · ');
            return (
              <li
                key={b.id}
                id={`vibloc-sugg-${i}`}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setHighlight(i)}
                // mousedown fires BEFORE input.onBlur — selection still works.
                onMouseDown={(e) => { e.preventDefault(); selectFromList(b); }}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: isActive
                    ? (darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(26,26,46,0.08)')
                    : 'transparent',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  transition: 'background 0.12s ease',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: darkMode ? '#e0e0e8' : '#1a1a2e',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {primary}
                </span>
                {secondary && (
                  <span
                    style={{
                      fontSize: 10,
                      color: darkMode ? 'rgba(224,224,232,0.62)' : '#6b7280',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {secondary}
                  </span>
                )}
                {meta && (
                  <span
                    style={{
                      fontSize: 9,
                      color: darkMode ? 'rgba(224,224,232,0.45)' : '#9ca3af',
                      letterSpacing: 0.4,
                      textTransform: 'uppercase',
                      marginTop: 1,
                    }}
                  >
                    {meta}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {result && (
        <div
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)',
            backdropFilter: 'blur(10px)',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            color: '#666',
            maxWidth: 280,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {result}
        </div>
      )}
    </div>
  );
}
