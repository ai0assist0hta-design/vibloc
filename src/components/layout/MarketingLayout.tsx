import { Outlet, useLocation } from 'react-router-dom';
import { MarketingHeader } from '@/components/layout/headers';
import { PH } from '@/content/placeholders';

export function MarketingLayout() {
  const { pathname } = useLocation();
  const isLanding = pathname === '/';

  return (
    <div className={`flex min-h-dvh flex-col ${isLanding ? '' : 'text-[#1a1a2e]'}`}>
      <MarketingHeader />
      <main className="relative flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
      {!isLanding ? (
        <footer className="relative shrink-0 border-t border-[#1a1a2e]/[0.08] bg-[#f5f3ef]/40 px-4 py-5 text-center text-[11px] leading-relaxed text-[#48484a] backdrop-blur-sm sm:text-xs">
          {PH.marketingFooter}
        </footer>
      ) : null}
    </div>
  );
}
