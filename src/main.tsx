import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppProviders } from './app/providers';
import { seedDevAdmin } from './features/auth/devAdmin';
import { setUserIdentityProvider } from './lib/music/buildingPlaylist';
import { useAuthStore } from './features/auth/useAuthStore';
import { AVATAR_BASES, avatarLayerUrl } from './features/avatar/avatarConfig';

// Warm the avatar PNG-layer cache for every base so the rooftop
// composite renders instantly on first selection. Just `base.png` is
// enough — variant layers stream in as the user customizes.
for (const b of AVATAR_BASES) {
  const url = avatarLayerUrl(b, 'base');
  if (url) { const img = new Image(); img.src = url; }
}

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
