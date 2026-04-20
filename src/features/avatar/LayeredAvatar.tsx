/**
 * LayeredAvatar — composes a HEADZ avatar from per-part PNG layers.
 *
 * Each base ships baked layer PNGs at /avatars/layers/<base>/<part>.png
 * pre-cropped to the same canvas. We stack them with absolutely-
 * positioned <img> tags so the browser paints them in z-order:
 *
 *   base → beard → mustache → hair → glasses → earrings → hat
 *
 * Order matters because beard/mustache should sit on the face but
 * BEHIND hair (so a long fringe overlaps), and the hat sits ABOVE
 * the hair so it crowns properly. Glasses cover the eyes (above
 * hair-bangs would be wrong, but our hair PNGs already exclude the
 * face area, so glasses on top is safe).
 *
 * No <Canvas>, no GLB, no traversal. Pure 2D, GPU-free, streams
 * over HTTP/2 in parallel.
 */

import {
  avatarLayerUrl,
  type AvatarBase,
  type VibAvatarConfig,
} from './avatarConfig';

type Props = {
  config: VibAvatarConfig;
  size?: number;
  className?: string;
  alt?: string;
};

/** Render z-order (bottom → top). */
const STACK: Array<{
  layer: 'base' | 'beard' | 'mustache' | 'hair' | 'glasses' | 'earrings' | 'hat';
  pick: (c: VibAvatarConfig) => number | boolean | null | undefined;
}> = [
  { layer: 'base',     pick: () => true },
  { layer: 'beard',    pick: (c) => c.beard ?? null },
  { layer: 'mustache', pick: (c) => c.mustache ?? null },
  { layer: 'hair',     pick: (c) => c.hair ?? null },
  { layer: 'earrings', pick: (c) => c.earrings ?? false },
  { layer: 'glasses',  pick: (c) => c.glasses ?? null },
  { layer: 'hat',      pick: (c) => c.hat ?? false },
];

export function LayeredAvatar({ config, size = 128, className, alt }: Props) {
  return (
    <div
      className={className}
      role={alt ? 'img' : undefined}
      aria-label={alt}
      style={{
        position: 'relative',
        width: size,
        height: size,
        overflow: 'hidden',
        background: '#f3f1ec',
      }}
    >
      {STACK.map(({ layer, pick }) => {
        const v = pick(config);
        let url: string | null = null;
        if (layer === 'hat' || layer === 'earrings') {
          if (v) url = avatarLayerUrl(config.base, layer);
        } else if (layer === 'base') {
          url = avatarLayerUrl(config.base, 'base');
        } else if (typeof v === 'number' && v > 0) {
          url = avatarLayerUrl(config.base, layer, v);
        }
        if (!url) return null;
        return (
          <img
            key={layer}
            src={url}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          />
        );
      })}
    </div>
  );
}

/** Convenience: layered headshot for a saved user — circular crop. */
export function LayeredAvatarCircle({
  base, config, size = 64,
}: { base?: AvatarBase; config: VibAvatarConfig; size?: number }) {
  void base;
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      borderRadius: '50%',
      overflow: 'hidden',
      background: '#f3f1ec',
      border: '2px solid rgba(26,26,46,0.10)',
    }}>
      <LayeredAvatar config={config} size={size} />
    </span>
  );
}
