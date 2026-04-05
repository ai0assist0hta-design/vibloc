import { useState, useCallback } from 'react';
import { PlateauScene } from './components/canvas/PlateauScene';
import { SearchBar } from './components/ui/SearchBar';
import { CITY_AREAS, type CityAreaKey } from './lib/osmLoader';
import './index.css';

function App() {
  const [area, setArea] = useState<CityAreaKey>('shinjuku');
  const [navigateTarget, setNavigateTarget] = useState<[number, number] | null>(null);

  const handleNavigate = useCallback((pos: [number, number]) => {
    setNavigateTarget(null);
    requestAnimationFrame(() => setNavigateTarget(pos));
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <PlateauScene area={area} navigateTarget={navigateTarget} />

      {/* Logo */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: 24,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 20,
          fontWeight: 600,
          color: '#1a1a2e',
          letterSpacing: 4,
          userSelect: 'none',
        }}
      >
        VIBLOC
      </div>

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
            onClick={() => setArea(key)}
            style={{
              padding: '8px 14px',
              borderRadius: 12,
              border: area === key ? '2px solid #1a1a2e' : '1px solid rgba(0,0,0,0.1)',
              background: area === key ? 'rgba(26,26,46,0.08)' : 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              fontWeight: area === key ? 700 : 400,
              color: '#1a1a2e',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            }}
          >
            {CITY_AREAS[key].label}
          </button>
        ))}
      </div>

      <SearchBar area={area} onNavigate={handleNavigate} />

      <div
        style={{
          position: 'absolute',
          bottom: 24,
          right: 24,
          padding: '8px 16px',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(20px)',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          color: '#666',
        }}
      >
        OpenStreetMap Data — ODbL
      </div>
    </div>
  );
}

export default App;
