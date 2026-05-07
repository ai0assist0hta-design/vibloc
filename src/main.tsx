import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppProviders } from './app/providers';
import { seedDevAdmin } from './features/auth/devAdmin';
import {
  setUserIdentityProvider,
  setSharedLikeBridge,
  mergeSharedLikesIntoStore,
} from './lib/music/buildingPlaylist';
import { useAuthStore } from './features/auth/useAuthStore';
import {
  bootSharedLikes,
  subscribeSharedLikes,
  getServerTrackLikers,
  getServerPlaylistLikers,
  toggleSharedTrackLike,
  toggleSharedPlaylistLike,
} from './lib/music/sharedLikes';

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

// Boot the shared (multi-user) likes channel — pulls every Supabase
// `track_likes` / `playlist_likes` row into an in-memory cache and
// subscribes to Realtime push so other users' hearts appear live.
// Subscribers re-fold the cache into the building store on every
// change so the existing UI (which reads `entry.tracks[i].likedBy`
// and `entry.playlistLikedBy`) "just works" with global data.
void bootSharedLikes();
const refoldLikes = () => mergeSharedLikesIntoStore(getServerTrackLikers, getServerPlaylistLikers);
subscribeSharedLikes(refoldLikes);
// Run once after a tick so the auth + buildingPlaylist stores have
// finished hydrating before the first refold.
setTimeout(refoldLikes, 0);
// Wire the dual-write bridge: every local toggleLike /
// togglePlaylistLike now ALSO posts to Supabase. fire-and-forget —
// the local optimistic update already drove the UI, the network
// call just persists + broadcasts to other clients.
setSharedLikeBridge(
  (b, t) => { void toggleSharedTrackLike(b, t); },
  (b, t) => { void toggleSharedPlaylistLike(b, t); },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
);
