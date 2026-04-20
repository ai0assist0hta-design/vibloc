/**
 * AvatarHeadshot — circular layered PNG portrait of a user's HEADZ avatar.
 *
 * Stacks per-part PNG layers (base + hair + glasses + hat …) so the
 * portrait reflects the saved customization. No <Canvas>, no GLB.
 *
 * Reads saved config from `useUserAvatar(userId)`; falls back to
 * `rollAvatarForId(userId)` if the user has never customized.
 */

import {
  rollAvatarForId,
  type VibAvatarConfig,
} from './avatarConfig';
import { LayeredAvatar } from './LayeredAvatar';
import { useUserAvatar } from './useUserAvatar';

type Props = {
  userId: string;
  /** Outer pixel size — circular crop. */
  size?: number;
  /** Override the config explicitly (skips the userId lookup). */
  config?: VibAvatarConfig;
  className?: string;
  alt?: string;
  onClick?: () => void;
};

export function AvatarHeadshot({
  userId, size = 64, config, className, alt, onClick,
}: Props) {
  const saved = useUserAvatar(userId);
  const cfg = config ?? saved ?? rollAvatarForId(userId);
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
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={alt ?? (interactive ? '프로필 편집' : undefined)}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        border: '2px solid rgba(26,26,46,0.10)',
        background: '#f3f1ec',
        cursor: interactive ? 'pointer' : 'default',
        verticalAlign: 'middle',
      }}
    >
      <LayeredAvatar config={cfg} size={size} alt={alt} />
    </span>
  );
}
