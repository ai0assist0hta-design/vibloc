/**
 * HeadzThumb — pure 2D <img> render of a HEADZ character.
 *
 * Use anywhere a 3D Canvas would be wasteful (small list cells,
 * tagger rows, loading placeholders, the editor's BaseGrid). One
 * <img> tag costs nothing — no WebGL context, no Three.js scene.
 *
 * The image source is the pre-rendered turntable frame shipped by
 * ThreeDee (Pose 10 smiling, frontal frame chosen per character via
 * visual review). Loaded lazily with a soft fade-in so the page
 * isn't hung up if these aren't yet in the browser cache.
 *
 * Pairs with `<AvatarHeadshot>` (3D) — use the thumb where you don't
 * need the head to follow a camera; use the headshot where you do.
 */

import { avatarThumbUrl, type VibAvatarConfig, type AvatarBase, normaliseBase } from './avatarConfig';

type Props = {
  /** Either a full config (we read `.base`) or just an AvatarBase. */
  config?: VibAvatarConfig;
  base?: AvatarBase | string;
  /** Output pixel size — circular crop. */
  size?: number;
  className?: string;
  alt?: string;
  onClick?: () => void;
};

export function HeadzThumb({
  config, base, size = 64, className, alt, onClick,
}: Props) {
  const resolvedBase: AvatarBase = config?.base
    ?? (base ? normaliseBase(base) : 'f-white');

  const interactive = !!onClick;

  return (
    <span
      className={className}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={alt ?? (interactive ? '프로필' : undefined)}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: '#f3f1ec',
        cursor: interactive ? 'pointer' : 'default',
      }}
    >
      <img
        src={avatarThumbUrl(resolvedBase)}
        alt={alt ?? ''}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </span>
  );
}
