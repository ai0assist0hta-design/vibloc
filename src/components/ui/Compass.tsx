import { useRef, useEffect } from 'react';
import { getAzimuthDeg, resetToNorth } from '../canvas/PlateauScene';

export function Compass({ darkMode = false }: { darkMode?: boolean }) {
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
  const textMain = darkMode ? '#e0e0e8' : '#1a1a2e';
  const textSub = darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)';
  const needleN = darkMode ? '#e0e0e8' : '#1a1a2e';
  const needleS = darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const tickCol = darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  const dotCenter = darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)';

  return (
    <div
      onClick={resetToNorth}
      style={{
        position: 'absolute',
        bottom: 80,
        right: 28,
        width: 56,
        height: 56,
        cursor: 'pointer',
        zIndex: 10,
        transition: 'opacity 0.4s ease',
      }}
      title="Reset to North"
    >
      {/* Glass background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: darkMode
            ? '0 2px 12px rgba(0,0,0,0.4)'
            : '0 2px 12px rgba(0,0,0,0.06)',
          border: `1px solid ${stroke}`,
          transition: 'all 0.4s ease',
        }}
      />
      <svg
        viewBox="0 0 56 56"
        width={56}
        height={56}
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
            fontFamily="'IBM Plex Mono', monospace"
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
            fontFamily="'IBM Plex Mono', monospace"
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
            fontFamily="'IBM Plex Mono', monospace"
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
            fontFamily="'IBM Plex Mono', monospace"
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
