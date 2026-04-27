/**
 * contrastColor — clamp a brand color's lightness so it stays
 * readable as TEXT on a given background mode.
 *
 * Genre / family palettes are tuned for fills and shape glyphs
 * (vivid pinks, yellows, teals). Used as text color on a WHITE
 * background, several of them collapse to near-invisible (jpop pink
 * #ffa3d9, classical yellow #ffcc00, singer teal #7eb3a3 — all sub-3:1
 * contrast vs white). The fix is the same Memoji-style trick used by
 * Linear / Notion: derive a darker text variant by clamping the HSL
 * lightness for light mode, and a brighter one for dark mode.
 *
 * Targets WCAG AA (4.5:1) for body text size; for chip/uppercase
 * 10–11 px we get away with ~3:1 since text is bold + short.
 */

type Mode = 'light' | 'dark';

const cache = new Map<string, string>();

export function contrastColor(hex: string, mode: Mode): string {
  const key = `${mode}|${hex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = compute(hex, mode);
  cache.set(key, out);
  return out;
}

function compute(hex: string, mode: Mode): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  // Clamp lightness for the target mode. Slightly bump saturation
  // when we darken light colors (otherwise they look muddy).
  let nl: number;
  let ns: number = s;
  if (mode === 'light') {
    nl = Math.min(l, 0.36);
    if (l > 0.55) ns = Math.min(1, s * 1.1);
  } else {
    nl = Math.max(l, 0.62);
    if (l < 0.45) ns = Math.min(1, s * 1.05);
  }
  const [r, g, b] = hslToRgb(h, ns, nl);
  return rgbToHex(r, g, b);
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0, gp = 0, bp = 0;
  if (h < 60)        { rp = c; gp = x; bp = 0; }
  else if (h < 120)  { rp = x; gp = c; bp = 0; }
  else if (h < 180)  { rp = 0; gp = c; bp = x; }
  else if (h < 240)  { rp = 0; gp = x; bp = c; }
  else if (h < 300)  { rp = x; gp = 0; bp = c; }
  else               { rp = c; gp = 0; bp = x; }
  return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}
