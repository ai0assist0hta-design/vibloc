/**
 * WeatherFX — LineSegments rain (prisoner849 pattern).
 *
 * Each raindrop is a 2-vertex line segment. The geometry stores
 *   • position    : the SAME (x, y, z) for both vertices of each pair
 *   • gEnds (vec2): (vertexFlag 0|1, segmentLength)
 *
 * In the vertex shader:
 *   y_loop  = -mod(yTop - (position.y - time * speed), bandHeight) + yTop
 *   y_final = y_loop + gEnds.x * gEnds.y      // second vertex lifted by length
 *
 * → vertex 0 sits at the foot of the streak, vertex 1 at the head;
 *   the GPU mod cycles y forever with no per-frame CPU upload.
 *
 * Reference: https://codepen.io/prisoner849/pen/poNXPyv
 *
 * Activation:
 *   • category === 'rain' / 'thunder' → line streaks, faster pace
 *   • category === 'snow'             → same primitive but tiny len + slow fall
 *   • everything else                 → component returns null
 */

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useWeatherStore } from '../../stores/useWeatherStore';
import { useDarkMode } from '../../lib/app/useDarkMode';
import { getIsPlaying, getGenreRGB } from '../ui/music/PreviewPlayer';

type Mode = 'rain' | 'snow';

type Params = {
  count: number;       // number of LINE SEGMENTS (geometry holds 2x positions)
  boxSize: number;     // half-width of the XZ square that follows the camera
  yTop: number;        // upper edge of the rain band, relative to camera
  yBottom: number;     // lower edge — drops cycle from top to bottom
  speed: number;       // u/s vertical fall speed (drives the time term)
  lenMin: number;      // streak length min
  lenMax: number;      // streak length max
  color: THREE.Color;
  alpha: number;
  lineWidth: number;
};

const VS = `
uniform float uTime;
uniform float uSpeed;
uniform float uYTop;
uniform float uYBottom;
uniform vec3  uCenter;
uniform vec2  uWind;

attribute vec2 gEnds;   // (vertexFlag 0|1, length)
varying float vGEnds;
varying float vY01;

void main() {
  // Center the rain box on the camera (xz). y is computed below
  // so we don't add uCenter.y here.
  vec3 pos = position;
  pos.x += uCenter.x;
  pos.z += uCenter.z;

  // GPU infinite fall loop — Pattern from prisoner849 / Three.js
  // discourse. yTop is the spawn ceiling in WORLD space (the city's
  // skyline tops out around y ≈ 400, so 600 keeps rain above the
  // tallest tower); yBottom is below ground so streaks finish their
  // fall onscreen.
  float band = uYTop - uYBottom;
  float t    = uTime * uSpeed;
  float yLoop = -mod(uYTop - (position.y - t), band) + uYTop;
  pos.y = yLoop;

  // Lift the second vertex of each line pair by its own length so
  // the segment becomes a real vertical streak.
  pos.y += gEnds.x * gEnds.y;

  // Wind nudge — proportional to how far the drop has fallen
  // through the band, so the streak visibly slants.
  float fallen = (uYTop - yLoop) / band; // 0 at top, 1 at bottom
  pos.xz += uWind * fallen * 6.0;

  vGEnds = gEnds.x;          // 0 at foot, 1 at head — for fragment fade
  vY01   = clamp(fallen, 0.0, 1.0);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FS = `
uniform vec3  uColor;
uniform float uAlpha;
varying float vGEnds;
varying float vY01;

void main() {
  // Head bright, tail fades — pow gives the classic raindrop look
  // without an additional gradient texture.
  float headFade = 1.0 - vGEnds;          // 1 at head, 0 at foot
  headFade = pow(headFade, 2.0);
  // Spawn fade: the very first slice after wrap is invisible so
  // there's no popping.
  float spawnFade = smoothstep(1.0, 0.92, vY01);
  float a = uAlpha * headFade * spawnFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

/**
 * Real-world precipitation → visual intensity curve.
 *
 * Open-Meteo's `current.precipitation` reports mm/h. Mapping it to a
 * 0..1 normalized "intensity" so the rain visualization scales with
 * actual conditions:
 *
 *   • 0 mm/h     → 0.30 (visual baseline so drizzle still reads as rain)
 *   • 0.5 mm/h   → 0.45 (light)
 *   • 2.5 mm/h   → 0.65 (moderate)
 *   • 10 mm/h    → 0.85 (heavy)
 *   • 20+ mm/h   → 1.00 (torrential — clamps)
 *
 * Curve uses a soft log so "0 → 1 mm" feels just-noticeable, and
 * "10 → 20" still feels heavier without saturating.
 */
function precipitationIntensity(mmPerHour: number): number {
  if (!(mmPerHour > 0)) return 0.30;
  // log1p(mm) / log1p(20) → ~0..1, then lifted into the 0.30..1.0
  // range so even 0.1 mm/h is visibly more than dry baseline.
  const t = Math.min(1, Math.log1p(mmPerHour) / Math.log1p(20));
  return 0.30 + (1 - 0.30) * t;
}

function makeParams(
  category: 'rain' | 'thunder' | 'snow',
  precipitationMm: number,
  dark: boolean,
): Params {
  if (category === 'snow') {
    // Snow scales density with precipitationMm (water-equivalent),
    // not speed — flakes always drift slowly.
    const i = precipitationIntensity(precipitationMm);
    return {
      count: Math.round(2500 + 4000 * i),
      boxSize: 1400,
      yTop: 400,
      yBottom: -200,
      speed: 50,
      lenMin: 1.5,
      lenMax: 3.0,
      color: new THREE.Color(0xfafafe),
      alpha: 0.55,
      lineWidth: 1,
    };
  }
  const isThunder = category === 'thunder';
  // Combined precipitation factor: thunder bumps the floor since a
  // thunderstorm without much rain is rare and dramatic visually.
  const baseI = precipitationIntensity(precipitationMm);
  const i = isThunder ? Math.max(0.7, baseI) : baseI;

  // Density grows linearly — drizzle 5k lines, downpour 18k.
  const count = Math.round(5000 + 13000 * i);
  // Speed accelerates with intensity — drizzle drifts at 180 u/s,
  // torrential rain whips down at 520 u/s. Speed scales sub-linearly
  // so heavy rain is fast but not motion-blur fast.
  const speed = 180 + 340 * Math.pow(i, 0.85);
  // Heavier rain → longer streaks (visually carries the speed).
  const lenMin = 8 + 8 * i;
  const lenMax = 16 + 16 * i;
  // Heavy rain reads slightly more saturated (alpha bump).
  const alpha = 0.65 + 0.25 * i;

  return {
    count,
    boxSize: 1400,
    yTop: 600,
    yBottom: -200,
    speed,
    lenMin,
    lenMax,
    // Mode-aware streak color so the rain reads against either
    // surface: charcoal `#4a5560` against light cityscapes, frosted
    // pale-blue `#cfd8e0` against the dark night sky.
    color: dark ? new THREE.Color(0xcfd8e0) : new THREE.Color(0x4a5560),
    alpha,
    lineWidth: 1,
  };
}

function makeGeometry(p: Params): THREE.BufferGeometry {
  const positions = new Float32Array(p.count * 2 * 3);
  const gEnds = new Float32Array(p.count * 2 * 2);
  const half = p.boxSize / 2;
  const bandH = p.yTop - p.yBottom;
  for (let i = 0; i < p.count; i++) {
    const x = (Math.random() - 0.5) * p.boxSize;
    const y = Math.random() * bandH + p.yBottom; // any phase within band
    const z = (Math.random() - 0.5) * p.boxSize;
    const len = p.lenMin + Math.random() * (p.lenMax - p.lenMin);

    // Same xyz for both vertices of the pair (vertex shader lifts
    // the second one upward via gEnds.x * gEnds.y).
    const pi = i * 6;
    positions[pi + 0] = x; positions[pi + 1] = y; positions[pi + 2] = z;
    positions[pi + 3] = x; positions[pi + 4] = y; positions[pi + 5] = z;

    const ei = i * 4;
    gEnds[ei + 0] = 0; gEnds[ei + 1] = len; // foot vertex
    gEnds[ei + 2] = 1; gEnds[ei + 3] = len; // head vertex

    // unused, silence "never read" linter on bandH/half
    void half;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('gEnds', new THREE.BufferAttribute(gEnds, 2));
  return g;
}

export function WeatherFX({ enabled = true }: { enabled?: boolean }) {
  const snapshot = useWeatherStore((s) => s.snapshot);
  const dark = useDarkMode();
  const { camera } = useThree();
  const linesRef = useRef<THREE.LineSegments>(null);

  const cat: 'rain' | 'thunder' | 'snow' | null = useMemo(() => {
    if (!enabled || !snapshot) return null;
    if (snapshot.category === 'rain' || snapshot.category === 'thunder' || snapshot.category === 'snow') {
      return snapshot.category;
    }
    return null;
  }, [enabled, snapshot]);

  // Re-derive params whenever the category OR the live precipitation
  // value changes — a rain shower that picks up from drizzle to
  // downpour will smoothly bump density / speed / streak length.
  const precipitationMm = snapshot?.precipitationMm ?? 0;
  const params = useMemo(
    () => (cat ? makeParams(cat, precipitationMm, dark) : null),
    [cat, precipitationMm, dark],
  );

  const geometry = useMemo(() => (params ? makeGeometry(params) : null), [params]);

  const material = useMemo(() => {
    if (!params) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime:      { value: 0 },
        uSpeed:     { value: params.speed },
        uYTop:      { value: params.yTop },
        uYBottom:   { value: params.yBottom },
        uCenter:    { value: new THREE.Vector3() },
        uWind:      { value: new THREE.Vector2() },
        uColor:     { value: params.color },
        uAlpha:     { value: params.alpha },
      },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
  }, [params]);

  // Persistent target color — exponentially eased toward each frame
  // so genre tint comes in smoothly when a song starts and fades
  // back to the neutral mode-aware streak color on pause / stop.
  const colorTargetRef = useRef(new THREE.Color());

  useFrame((_, dt) => {
    if (!material || !params) return;
    const u = material.uniforms;
    u.uTime.value += dt;

    // Rain box follows camera xz so user can never walk out.
    (u.uCenter.value as THREE.Vector3).copy(camera.position);

    // Wind: gentle 0.3 Hz oscillation, doubles when WeatherSnapshot.windy.
    const wMag = (snapshot?.windy ? 0.55 : 0.18) *
      (Math.sin(u.uTime.value * 0.31) * 0.5 + 0.5);
    (u.uWind.value as THREE.Vector2).set(wMag * 8, wMag * 5);

    // Genre-tinted rain: when a track is playing, the rain color
    // shifts toward the currently-playing genre's signature RGB
    // (jazz=blue, pop=pink, etc.) — same hue that lights up the
    // selected building's EQ bars, so the precipitation visually
    // belongs to the song. We don't replace the mode color: we mix
    // ~70 % toward genre + 30 % retained mode color, so streaks
    // stay legible and don't wash out into pure saturated tint.
    const target = colorTargetRef.current;
    const playing = getIsPlaying();
    if (playing) {
      const g = getGenreRGB();
      target.set(
        params.color.r * 0.30 + g[0] * 0.70,
        params.color.g * 0.30 + g[1] * 0.70,
        params.color.b * 0.30 + g[2] * 0.70,
      );
    } else {
      target.copy(params.color);
    }
    // Exponential approach toward target — tau ≈ 250 ms, the same
    // settle time as the EQ audio-active envelope so rain and city
    // both react to play / pause in lockstep.
    const tauColor = 0.25;
    const kc = 1 - Math.exp(-dt / tauColor);
    const c = u.uColor.value as THREE.Color;
    c.r += (target.r - c.r) * kc;
    c.g += (target.g - c.g) * kc;
    c.b += (target.b - c.b) * kc;
  });

  if (!geometry || !material) return null;

  return (
    <lineSegments
      ref={linesRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={10}
    />
  );
}
