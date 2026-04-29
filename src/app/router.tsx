import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { MarketingLayout } from '@/components/layout/MarketingLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { LandingPage } from '@/pages/landing/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { MyPage } from '@/pages/mypage/MyPage';
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
 *  streams in. Pure CSS, no extra deps, no layout shift. */
function MapBootSplash() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0f0f14', color: '#faf9f6',
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase',
    }}>
      Loading map…
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/mypage" element={<MyPage />} />
      </Route>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>
      <Route
        path="/map"
        element={
          // Desktop-only gate wraps the 3D experience: phones / small
          // viewports get a friendly splash explaining VIBLOC needs a
          // larger screen, instead of a broken layout. Marketing /
          // share-preview routes stay mobile-friendly outside this.
          <DesktopOnlyGate>
            <Suspense fallback={<MapBootSplash />}>
              <MapAppPage />
            </Suspense>
          </DesktopOnlyGate>
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
  );
}
