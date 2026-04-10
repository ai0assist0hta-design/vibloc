/**
 * Apple-Music-style header tint hook.
 *
 * Source: 2026-04-09 UI/UX research, B.3 (Apple Music iOS 26.4 paired
 * complementary color, not literal dominant) and I.2 (artwork-seeded
 * gradients). The top pinned track's artwork is sampled, and the
 * panel header is washed with a *complementary* hue (rotated ~150°)
 * clamped to a low-saturation/legibility band so body text never
 * loses contrast.
 *
 * Returns null while loading or when no track is pinned. Caller
 * applies the returned `wash` color as a subtle background gradient
 * inside the header region only — never behind body text.
 */

import { useEffect, useState } from 'react';
import { extractDominantHsl, hslToHex } from './genreColorSource';

const cache = new Map<string, string>();

export function useArtworkTint(artworkUrl: string | null): string | null {
  const [tint, setTint] = useState<string | null>(() =>
    artworkUrl ? cache.get(artworkUrl) ?? null : null,
  );

  useEffect(() => {
    if (!artworkUrl) { setTint(null); return; }
    const cached = cache.get(artworkUrl);
    if (cached) { setTint(cached); return; }
    let cancelled = false;
    void extractDominantHsl(artworkUrl).then((hsl) => {
      if (cancelled || !hsl) return;
      // Apple's 2026 direction: paired/complement color with the
      // saturation pulled toward a UI-safe band. Rotate the hue ~150°
      // (close to complementary, but biased away from a pure 180°
      // flip which often hits the same drab tone), clamp saturation
      // to ≤ 0.55, and pin lightness to ~0.78 so the wash is visibly
      // tinted but never overpowers the body text below it.
      const h = (hsl.h + 150) % 360;
      const s = Math.min(0.55, Math.max(0.2, hsl.s));
      const l = 0.78;
      const hex = hslToHex(h, s, l);
      cache.set(artworkUrl, hex);
      setTint(hex);
    });
    return () => { cancelled = true; };
  }, [artworkUrl]);

  return tint;
}
