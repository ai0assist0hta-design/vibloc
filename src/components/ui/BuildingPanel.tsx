import { useState } from 'react';
import { useBuildingStore } from '../../stores/useBuildingStore';
import { GENRE_COLORS } from '../../data/genres';
import type { GenreKey } from '../../types';
import { getBuildingState, getFloorColor, getFloorTagCount } from '../../lib/geo/tasteEngine';

export function BuildingPanel() {
  const selectedId = useBuildingStore((s) => s.selectedBuildingId);
  const buildings = useBuildingStore((s) => s.buildings);
  const allTags = useBuildingStore((s) => s.tags);
  const tags = selectedId ? (allTags.get(selectedId) ?? []) : [];
  const addTag = useBuildingStore((s) => s.addTag);
  const selectBuilding = useBuildingStore((s) => s.selectBuilding);

  const [selectedFloor, setSelectedFloor] = useState(1);

  const building = buildings.find((b) => b.id === selectedId);
  if (!building) return null;

  const state = getBuildingState(tags.length);
  const topDj = getTopDj(tags);

  function handleTag(genre: GenreKey) {
    addTag(building!.id, selectedFloor, genre);
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: 24,
        top: 24,
        width: 320,
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        borderRadius: 20,
        padding: 24,
        fontFamily: "'IBM Plex Mono', monospace",
        color: '#1a1a2e',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{building.name}</h2>
        <button
          onClick={() => selectBuilding(null)}
          style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }}
        >
          ×
        </button>
      </div>

      <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
        {building.levels}F · {tags.length} tags · {state}
        {topDj && <span> · {topDj}</span>}
      </div>

      {/* Floor selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Floor</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {Array.from({ length: Math.min(building.levels, 20) }, (_, i) => i + 1).map((f) => {
            const fColor = getFloorColor(tags, f);
            const fCount = getFloorTagCount(tags, f);
            const hasTag = fCount > 0;
            return (
              <button
                key={f}
                onClick={() => setSelectedFloor(f)}
                style={{
                  width: 32,
                  height: 28,
                  borderRadius: 8,
                  border: selectedFloor === f ? '2px solid #ff9500' : hasTag ? `2px solid ${fColor}` : '1px solid #ddd',
                  background: hasTag ? `${fColor}22` : selectedFloor === f ? '#fff8f0' : 'transparent',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: hasTag ? fColor : undefined,
                  fontWeight: hasTag ? 700 : 400,
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {/* Genre buttons */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Genre</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {Object.entries(GENRE_COLORS).map(([key, g]) => (
            <button
              key={key}
              onClick={() => handleTag(key as GenreKey)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: 'none',
                background: g.color + '22',
                color: g.color,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'IBM Plex Mono', monospace",
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = g.color + '44'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = g.color + '22'; }}
            >
              {g.label.split('/')[0].trim()}
            </button>
          ))}
        </div>
      </div>

      {/* Recent tags */}
      {tags.length > 0 && (
        <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <label style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
            Recent Tags
          </label>
          <div style={{ marginTop: 6, maxHeight: 120, overflow: 'auto' }}>
            {tags.slice(-5).reverse().map((t) => {
              const gc = GENRE_COLORS[t.genre] ?? GENRE_COLORS.pop;
              return (
              <div key={t.id} style={{ fontSize: 11, color: '#555', padding: '3px 0' }}>
                <span style={{ color: gc.color, fontWeight: 600 }}>
                  {gc.label.split('/')[0].trim()}
                </span>
                {' '}· F{t.floor}
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getTopDj(tags: { userId: string }[]): string | null {
  if (tags.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const t of tags) counts[t.userId] = (counts[t.userId] || 0) + 1;
  const top = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];
  return top[0];
}
