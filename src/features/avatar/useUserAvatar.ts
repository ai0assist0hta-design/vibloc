/**
 * Per-user avatar customization persistence.
 *
 * Pattern mirrors `buildingPlaylist.ts`: a tiny module-level store +
 * subscribe pattern so any component (rooftop 3D, profile pin, panel
 * header, future customizer) reflects the latest config without
 * each consumer wiring up its own localStorage listener.
 *
 * Storage key: `vibloc.avatar.<userId>` → JSON-serialized
 * VibAvatarConfig. When no saved config exists for a user, the call
 * site falls back to `rollAvatarForId(userId)` for a deterministic
 * default; saving overrides that default.
 */

import { useEffect, useState } from 'react';
import { normaliseBase, type VibAvatarConfig } from './avatarConfig';

const KEY = (userId: string) => `vibloc.avatar.${userId}`;

type Listener = (userId: string) => void;
const listeners = new Set<Listener>();

function readStorage(userId: string): VibAvatarConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VibAvatarConfig;
    // Migrate stale Brown bases (no longer shipped) to Black.
    return { ...parsed, base: normaliseBase(parsed.base as unknown as string) };
  } catch {
    return null;
  }
}

export function getSavedAvatar(userId: string): VibAvatarConfig | null {
  return readStorage(userId);
}

export function saveAvatar(userId: string, config: VibAvatarConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(config));
  } catch { /* quota / disabled — ignore */ }
  for (const l of listeners) l(userId);
}

export function clearAvatar(userId: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEY(userId)); } catch { /* ignore */ }
  for (const l of listeners) l(userId);
}

/** React hook — re-renders when this user's avatar config changes
 *  (in this tab OR another tab via the storage event). */
export function useUserAvatar(userId: string | null): VibAvatarConfig | null {
  const [snap, setSnap] = useState<VibAvatarConfig | null>(
    () => (userId ? readStorage(userId) : null),
  );

  useEffect(() => {
    if (!userId) { setSnap(null); return; }
    setSnap(readStorage(userId));
    const onLocal: Listener = (changedId) => {
      if (changedId === userId) setSnap(readStorage(userId));
    };
    listeners.add(onLocal);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY(userId)) setSnap(readStorage(userId));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(onLocal);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  return snap;
}
