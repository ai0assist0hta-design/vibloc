import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { MarketingLayout } from '@/components/layout/MarketingLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { LandingPage } from '@/pages/landing/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { MyPage } from '@/pages/mypage/MyPage';

// MapAppPage drags in three.js / drei / postprocessing / 3d-tiles-renderer
// (~1.4 MB of the bundle). Visitors landing on `/`, `/login`, `/signup`,
// `/mypage` should never pay that cost up-front.
const MapAppPage = lazy(() =>
  import('@/pages/map/MapAppPage').then((m) => ({ default: m.MapAppPage })),
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
          <Suspense fallback={<MapBootSplash />}>
            <MapAppPage />
          </Suspense>
        }
      />
    </Routes>
  );
}
