import { Link } from 'react-router-dom';
import { PH } from '@/content/placeholders';

function Tower({
  widthPct,
  height,
  tint,
}: {
  widthPct: number;
  height: string;
  tint: 'a' | 'b' | 'c' | 'd';
}) {
  const skin: Record<string, string> = {
    a: 'linear-gradient(180deg, #eceef3 0%, #cfd5df 52%, #b9c0cc 100%)',
    b: 'linear-gradient(180deg, #f4f5f8 0%, #dce0e8 48%, #c8ced8 100%)',
    c: 'linear-gradient(180deg, #f2f3f7 0%, #d8dde6 50%, #c2c9d6 100%)',
    d: 'linear-gradient(180deg, #e4e8ef 0%, #c5ccd8 50%, #a8b2c4 100%)',
  };
  return (
    <div
      className="relative shrink-0 rounded-t-[12px] shadow-[0_24px_60px_-12px_rgba(26,26,46,0.28)] ring-1 ring-white/40"
      style={{
        width: `${widthPct}%`,
        height,
        background: skin[tint],
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-[9%] inset-y-[7%] rounded-[4px] opacity-[0.4]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 6px,
            rgba(26,26,46,0.11) 6px,
            rgba(26,26,46,0.11) 7px
          ),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 9px,
            rgba(26,26,46,0.07) 9px,
            rgba(26,26,46,0.07) 10px
          )`,
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[22%] rounded-t-[11px] bg-gradient-to-b from-white/55 to-transparent" />
    </div>
  );
}

function Cityscape({ variant = 'default' }: { variant?: 'default' | 'inlineMobile' }) {
  const root =
    variant === 'inlineMobile'
      ? 'relative flex h-full min-h-[min(48vh,400px)] w-full flex-col items-center justify-end'
      : 'relative flex h-full min-h-0 w-full flex-col items-center justify-end';
  return (
    <div className={root}>
      <div
        aria-hidden
        className="pointer-events-none absolute right-[8%] top-[10%] h-[min(28vw,200px)] w-[min(28vw,200px)] rounded-full bg-gradient-to-br from-indigo-200/50 to-transparent blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[32%] left-[5%] h-40 w-40 rounded-full bg-rose-200/25 blur-3xl"
      />

      <div className="relative z-[1] flex w-[min(90vw,500px)] items-end justify-center gap-[2.5%] px-2 sm:w-[min(85vw,560px)] sm:gap-3 lg:h-[min(56vh,540px)] lg:w-[min(46vw,620px)] lg:max-w-none">
        <Tower widthPct={16} height="min(26vh, 190px)" tint="a" />
        <Tower widthPct={28} height="min(50vh, 360px)" tint="b" />
        <Tower widthPct={19} height="min(38vh, 280px)" tint="c" />
        <Tower widthPct={21} height="min(44vh, 320px)" tint="d" />
      </div>

      <div
        aria-hidden
        className="relative z-[2] -mt-px h-16 w-[min(92vw,680px)] max-w-full bg-gradient-to-b from-[#1a1a2e]/[0.07] to-transparent opacity-80 sm:h-20"
        style={{
          maskImage: 'linear-gradient(90deg, transparent, black 15%, black 85%, transparent)',
        }}
      />
      <div className="relative z-[2] h-px w-[min(92vw,680px)] max-w-full bg-gradient-to-r from-transparent via-[#1a1a2e]/25 to-transparent" />
    </div>
  );
}

const landingPanelBg =
  'linear-gradient(160deg, rgba(255,255,255,0.65) 0%, rgba(245,243,238,0.2) 45%, rgba(215,220,230,0.35) 100%)';

export function LandingPage() {
  return (
    <div className="relative isolate flex min-h-[calc(100dvh-3.5rem)] w-full flex-1 flex-col lg:min-h-[calc(100dvh-4rem)]">
      {/* 데스크톱: 우측 장식만 전체 캔버스에 깔고, 카피는 뷰포트 정중앙 */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden lg:block"
        aria-hidden
      >
        <div
          className="absolute inset-0 vibloc-landing-panel"
          style={{ background: landingPanelBg }}
        />
        <div className="absolute inset-y-0 right-0 flex w-[min(52%,720px)] items-end justify-center pb-8 pr-2 pt-[18vh] xl:w-[min(48%,800px)] xl:pr-4">
          <Cityscape />
        </div>
      </div>

      <section className="relative z-0 flex flex-1 flex-col items-center justify-center px-5 py-14 text-center sm:px-8 sm:py-20 lg:min-h-[calc(100dvh-4rem)] lg:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[min(70vh,560px)] w-px -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-transparent via-[#1a1a2e]/10 to-transparent"
        />

        <div className="relative z-[1] mx-auto w-full max-w-[min(100%,34rem)] sm:max-w-xl lg:max-w-2xl">
          <p
            className="mb-8 text-[11px] font-medium tracking-[0.35em] text-[#1a1a2e]/45 sm:tracking-[0.45em]"
            style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
          >
            {PH.landing.brandMark}
          </p>

          <h1
            className="text-balance text-[clamp(2rem,5.5vw,3.75rem)] font-semibold leading-[1.08] tracking-[-0.04em] text-[#1a1a2e] xl:text-[clamp(2.25rem,4vw,4rem)]"
            style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
          >
            {PH.landing.headline}
          </h1>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:mt-14 sm:gap-x-8">
            <Link
              to="/map"
              className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#1a1a2e] px-7 py-3 text-[13px] font-semibold leading-none tracking-tight text-[#f5f4f1] shadow-[0_16px_40px_-12px_rgba(26,26,46,0.5)] transition-[transform,box-shadow] hover:shadow-[0_20px_48px_-10px_rgba(26,26,46,0.55)] active:scale-[0.98] sm:px-8 sm:text-sm"
            >
              맵
              <span
                aria-hidden
                className="inline-block transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
            <div
              className="flex items-center gap-4 text-[13px] font-medium text-[#1a1a2e]/50 sm:gap-5"
              style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
            >
              <Link to="/login" className="rounded-md px-1 py-1 transition-colors hover:text-[#1a1a2e]">
                로그인
              </Link>
              <span className="text-[#1a1a2e]/18" aria-hidden>
                ·
              </span>
              <Link to="/signup" className="rounded-md px-1 py-1 transition-colors hover:text-[#1a1a2e]">
                가입
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 모바일·태블릿: 타워는 히어로 아래 블록 */}
      <section className="vibloc-landing-panel relative z-0 flex flex-col overflow-hidden border-t border-[#1a1a2e]/[0.05] lg:hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: landingPanelBg }}
        />
        <div className="relative z-[1] flex flex-1 flex-col items-center justify-end pb-8 pt-4">
          <Cityscape variant="inlineMobile" />
        </div>
      </section>
    </div>
  );
}
