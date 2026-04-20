import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppProviders } from './app/providers';
import { seedDevAdmin } from './features/auth/devAdmin';
import { setUserIdentityProvider } from './lib/music/buildingPlaylist';
import { useAuthStore } from './features/auth/useAuthStore';
import { preloadAvatarBases } from './features/avatar/AvatarMesh';

// Preload all 6 HEADZ base GLBs (~1.2MB Draco) so the avatar pops in
// instantly the first time a building is selected.
preloadAvatarBases();

// Dev 모드: 어드민 계정 자동 주입 (로그인/회원가입 불필요)
if (import.meta.env.DEV) {
  seedDevAdmin();
}

// Wire auth store → playlist tagger identity (name + avatar)
setUserIdentityProvider(() => {
  const user = useAuthStore.getState().user;
  if (!user) return null;
  return { id: user.id, name: user.displayName || user.email, avatarUrl: user.avatarUrl };
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
);
