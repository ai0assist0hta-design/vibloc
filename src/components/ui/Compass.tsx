import { useRef, useEffect } from 'react';
import { getAzimuthDeg, resetToNorth } from '../canvas/PlateauScene';
import { usePlayerState } from './music/PreviewPlayer';
import { useT } from '../../lib/app/i18n';

export function Compass({ darkMode = false }: { darkMode?: boolean }) {
  const t = useT();
  // Couple visibility with the NowPlayingBar — when nothing is
  // playing, the orphaned compass disc reads as floating chrome
  // with no anchor. Both fade together, so the bottom cluster
  // appears and disappears as one unit.
  const player = usePlayerState();
  const playing = !!player.currentId && !!player.meta;
  const needleRef = useRef<SVGGElement>(null);
  const rafRef = useRef<number>(0);

  // Direct DOM update loop — no React re-renders
  useEffect(() => {
    function loop() {
      if (needleRef.current) {
        const deg = getAzimuthDeg();
        needleRef.current.setAttribute('transform', `rotate(${-deg}, 28, 28)`);
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const stroke = darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)';
  const textMain = darkMode ? '#e0e0e8' : '#0e0e1a';
  const textSub = darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)';
  const needleN = darkMode ? '#e0e0e8' : '#0e0e1a';
  const needleS = darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const tickCol = darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  const dotCenter = darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)';

  return (
    <div
      onClick={resetToNorth}
      style={{
        // Tucked above the centered NowPlayingBar so it lives in the
        // bottom thumb-zone alongside the playback chrome instead of
        // floating in the top-right corner. Semi-transparent so the
        // 3D city remains readable through the disc.
        position: 'fixed',
        bottom: 132,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 48,
        height: 48,
        cursor: playing ? 'pointer' : 'default',
        zIndex: 50,
        opacity: playing ? 0.62 : 0,
        pointerEvents: playing ? 'auto' : 'none',
        transition: 'opacity 240ms ease, transform 240ms ease',
      }}
      onMouseEnter={(e) => { if (playing) e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(e) => { if (playing) e.currentTarget.style.opacity = '0.62'; }}
      title={t('compass.reset')}
      aria-label={t('compass.reset')}
    >
      {/* Glass background — extra-translucent so the underlying city is visible. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: darkMode ? 'rgba(15,15,20,0.32)' : 'rgba(255,255,255,0.36)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          boxShadow: darkMode
            ? '0 2px 10px rgba(0,0,0,0.35)'
            : '0 2px 10px rgba(0,0,0,0.10)',
          border: `1px solid ${stroke}`,
          transition: 'all 0.4s ease',
        }}
      />
      <svg
        viewBox="0 0 56 56"
        width={48}
        height={48}
        style={{ position: 'relative', zIndex: 1 }}
      >
        {/* Tick marks at 45-degree intervals */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const r1 = 24.5;
          const r2 = angle % 90 === 0 ? 21 : 22.5;
          const rad = (angle * Math.PI) / 180;
          const x1 = 28 + Math.sin(rad) * r1;
          const y1 = 28 - Math.cos(rad) * r1;
          const x2 = 28 + Math.sin(rad) * r2;
          const y2 = 28 - Math.cos(rad) * r2;
          return (
            <line
              key={angle}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={tickCol}
              strokeWidth={angle % 90 === 0 ? 1.2 : 0.6}
            />
          );
        })}

        {/* Rotating needle group */}
        <g ref={needleRef}>
          {/* North needle (triangle) */}
          <polygon
            points="28,7.5 26.2,24 29.8,24"
            fill={needleN}
          />
          {/* South needle (thinner, transparent) */}
          <polygon
            points="28,48.5 26.8,32 29.2,32"
            fill={needleS}
          />
          {/* Center dot */}
          <circle cx={28} cy={28} r={2.2} fill={dotCenter} />

          {/* N label */}
          <text
            x={28}
            y={6}
            textAnchor="middle"
            fontSize={7}
            fontWeight={700}
            fontFamily="'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace"
            fill={needleN}
            dominantBaseline="auto"
          >
            N
          </text>

          {/* E label */}
          <text
            x={51}
            y={30}
            textAnchor="middle"
            fontSize={5.5}
            fontWeight={400}
            fontFamily="'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace"
            fill={textSub}
            dominantBaseline="middle"
          >
            E
          </text>

          {/* S label */}
          <text
            x={28}
            y={55}
            textAnchor="middle"
            fontSize={5.5}
            fontWeight={400}
            fontFamily="'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace"
            fill={textSub}
            dominantBaseline="auto"
          >
            S
          </text>

          {/* W label */}
          <text
            x={5}
            y={30}
            textAnchor="middle"
            fontSize={5.5}
            fontWeight={400}
            fontFamily="'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace"
            fill={textSub}
            dominantBaseline="middle"
          >
            W
          </text>
        </g>
      </svg>
    </div>
  );
}
