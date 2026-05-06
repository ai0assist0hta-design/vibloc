import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { MarketingLayout } from '@/components/layout/MarketingLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { LandingPage } from '@/pages/landing/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { MyPage } from '@/pages/mypage/MyPage';
import { PlaylistDetailPage } from '@/pages/mypage/PlaylistDetailPage';
import { DesktopOnlyGate } from '@/components/ui/DesktopOnlyGate';

// MapAppPage drags in three.js / drei / postprocessing / 3d-tiles-renderer
// (~1.4 MB of the bundle). Visitors landing on `/`, `/login`, `/signup`,
// `/mypage` should never pay that cost up-front.
const MapAppPage = lazy(() =>
  import('@/pages/map/MapAppPage').then((m) => ({ default: m.MapAppPage })),
);

// `/p` decodes a self-contained share URL and renders a read-only
// playlist preview with per-track Apple Music deep links. Pulled in
// lazily so the marketing entry stays small even though most
// recipients land here cold from a copied link.
const PlaylistPreviewPage = lazy(() =>
  import('@/pages/share/PlaylistPreviewPage').then(
    (m) => ({ default: m.PlaylistPreviewPage }),
  ),
);

/** Tiny fallback so the user sees *something* while the 3D bundle
 *  streams in. Pure CSS, no extra deps, no layout shift. Background
 *  uses the deepened INK so the splash → map transition reads as
 *  the same surface (no flash of a different color). */
function MapBootSplash() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0e0e1a', color: '#faf9f6',
      fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
      fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase',
    }}>
      Loading map…
    </div>
  );
}

export function AppRoutes() {
  // Per product decision (2026-05-04): VIBLOC is a desktop-only
  // product. Every route — landing, auth, mypage, playlist detail,
  // map, share-preview — is wrapped in <DesktopOnlyGate> so phone /
  // small-tablet visitors hit a single consistent "open on a wider
  // screen" splash rather than seeing a half-broken layout. No
  // mobile build, no mobile fallback paths.
  return (
    <DesktopOnlyGate>
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/mypage" element={<MyPage />} />
          {/* OSM ids contain a slash ("way/123"), so we capture the
              rest of the path with a splat and decode it inside the
              page component. */}
          <Route path="/mypage/playlist/*" element={<PlaylistDetailPage />} />
        </Route>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Route>
        <Route
          path="/map"
          element={
            <Suspense fallback={<MapBootSplash />}>
              <MapAppPage />
            </Suspense>
          }
        />
        <Route
          path="/p"
          element={
            <Suspense fallback={null}>
              <PlaylistPreviewPage />
            </Suspense>
          }
        />
      </Routes>
    </DesktopOnlyGate>
  );
}
