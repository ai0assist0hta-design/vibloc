import { Route, Routes } from 'react-router-dom';
import { MarketingLayout } from '@/components/layout/MarketingLayout';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { LandingPage } from '@/pages/landing/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { MapAppPage } from '@/pages/map/MapAppPage';
import { MyPage } from '@/pages/mypage/MyPage';

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
      <Route path="/map" element={<MapAppPage />} />
    </Routes>
  );
}
