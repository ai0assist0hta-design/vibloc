import { Outlet } from 'react-router-dom';
import { AuthHeader } from '@/components/layout/headers';
import { PH } from '@/content/placeholders';

export function AuthLayout() {
  return (
    <div className="min-h-dvh bg-[#f8f7f4] text-[#1a1a2e]">
      <AuthHeader />

      <div className="mx-auto grid min-h-[calc(100dvh-3.5rem)] w-full max-w-[1600px] grid-cols-1 items-stretch gap-0 px-4 py-6 sm:min-h-[calc(100dvh-4rem)] sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-12 lg:py-10">
        <aside className="hidden flex-col items-center justify-center gap-8 text-center lg:flex lg:pr-6">
          <div className="mx-auto w-full max-w-md space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1a1a2e]/45">
              {PH.authAside.kicker}
            </p>
            <h1 className="text-balance text-4xl font-semibold leading-[1.12] tracking-[-0.03em] text-[#1a1a2e] xl:text-5xl">
              {PH.authAside.title}
            </h1>
            <p className="text-pretty text-base leading-relaxed text-[#1a1a2e]/60">{PH.authAside.body}</p>
          </div>
          <div className="relative mx-auto mt-2 h-40 w-full max-w-md">
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2">
              {[0.45, 0.72, 0.55, 0.9, 0.38].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-lg bg-gradient-to-t from-[#1a1a2e]/[0.12] to-[#1a1a2e]/[0.04]"
                  style={{ height: `${h * 100}%` }}
                />
              ))}
            </div>
            <p className="absolute -bottom-6 left-0 right-0 text-center text-xs text-[#1a1a2e]/40">
              {PH.authAside.visualCaption}
            </p>
          </div>
        </aside>

        <div className="flex min-h-0 flex-col justify-center lg:items-end">
          <div className="vibloc-glass-panel w-full max-w-md rounded-2xl border border-white/60 p-6 shadow-xl shadow-[#1a1a2e]/[0.06] sm:p-8 lg:max-w-[440px]">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
