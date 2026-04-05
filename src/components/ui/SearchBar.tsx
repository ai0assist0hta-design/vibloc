import { useState, useCallback } from 'react';
import { geocodeAddress, geoToLocalMeters, type GeoResult } from '../../lib/geocoder';
import { CITY_AREAS, type CityAreaKey } from '../../lib/osmLoader';

type SearchBarProps = {
  area: CityAreaKey;
  onNavigate: (position: [number, number]) => void;
};

export function SearchBar({ area, onNavigate }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);

    const geo = await geocodeAddress(query);
    if (!geo) {
      setResult('Not found');
      setLoading(false);
      return;
    }

    const config = CITY_AREAS[area];
    const [x, z] = geoToLocalMeters(geo.lat, geo.lon, config.refLat, config.refLon);
    onNavigate([x, z]);
    setResult(geo.displayName.split(',').slice(0, 3).join(','));
    setLoading(false);
  }, [query, area, onNavigate]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        right: 24,
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
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 14,
          padding: '6px 8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search address..."
          style={{
            width: 200,
            padding: '6px 12px',
            border: 'none',
            background: 'transparent',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            color: '#1a1a2e',
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
            background: '#1a1a2e',
            color: '#fff',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '...' : 'Go'}
        </button>
      </div>
      {result && (
        <div
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.6)',
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
