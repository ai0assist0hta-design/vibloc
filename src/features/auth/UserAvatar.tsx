import { resolveAvatarUrl } from './avatar';

type Props = {
  user: { displayName?: string; avatarUrl?: string | null };
  size?: number;
  className?: string;
  /** 헤더 등 인접 텍스트가 있으면 빈 문자열(장식) */
  alt?: string;
};

export function UserAvatar({ user, size = 32, className = '', alt }: Props) {
  const src = resolveAvatarUrl(user.avatarUrl);
  const name = user.displayName?.trim() || 'user';
  const altText = alt !== undefined ? alt : name;
  return (
    <img
      src={src}
      alt={altText}
      width={size}
      height={size}
      className={`rounded-full object-cover ring-1 ring-[#0e0e1a]/10 ${className}`}
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
      title={name}
    />
  );
}
