import { Link } from 'react-router-dom';
import { useI18nStore, type Lang } from '@/lib/app/i18n';
import { PlateauScene } from '@/components/canvas/PlateauScene';
import { LanguageToggle } from '@/components/ui/LanguageToggle';

/*
 * Design tokens — 8px grid, Material Design dark theme opacities,
 * WCAG AA contrast, fluid typography via clamp().
 *
 * Text hierarchy (white-on-dark):
 *   Primary   rgba(255,255,255, 0.87)  — headlines, stat numbers, CTA
 *   Secondary rgba(255,255,255, 0.60)  — body, descriptions
 *   Tertiary  rgba(255,255,255, 0.38)  — labels, captions, chips
 *
 * Spacing scale (8px base):
 *   8 / 16 / 24 / 32 / 48 / 64 / 96 / 128
 */

const sans =
  "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const mono = "'IBM Plex Mono', ui-monospace, monospace";

/* ── Colors ── */
const C = {
  bg: '#0A0A0F',
  primary: 'rgba(255,255,255,0.87)',
  secondary: 'rgba(255,255,255,0.60)',
  tertiary: 'rgba(255,255,255,0.38)',
  muted: 'rgba(255,255,255,0.20)',
  surface: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  borderHover: 'rgba(255,255,255,0.16)',
  cta: '#F0EDE8',
  ctaText: '#0A0A0F',
} as const;

/* ── i18n copy ── */
const copy: Record<
  Lang,
  {
    brand: string;
    headline: string;
    sub: string;
    cta: string;
    login: string;
    join: string;
    statsLabel: [string, string, string];
    features: { icon: string; title: string; desc: string }[];
    bottomCta: string;
    bottomBtn: string;
  }
> = {
  ko: {
    brand: 'VIBE + BLOCK',
    headline: '도시 위에\n음악을 쌓다',
    sub: '3D 도시 위에서 건물마다 다른 음악을 발견하세요',
    cta: '맵 탐험하기',
    login: '로그인',
    join: '회원가입',
    statsLabel: ['도시', '건물', '장르 패밀리'],
    features: [
      { icon: '◇', title: '6개 도시, 50,000+ 건물', desc: '도쿄 · 서울 · LA · 맨해튼을 3D로 탐험' },
      { icon: '◆', title: '환경 맞춤 AI 추천', desc: '날씨 · 시간 · 계절 · 테넌트가 플레이리스트를 바꿈' },
      { icon: '●', title: '실시간 동기화', desc: '현재 시간의 태양 · 날씨 · 차트가 도시에 반영' },
      { icon: '♬', title: '7 장르 패밀리', desc: '18개 장르를 7가지 색으로 한눈에' },
    ],
    bottomCta: '지금 바로 탐험해보세요',
    bottomBtn: '맵 열기',
  },
  en: {
    brand: 'VIBE + BLOCK',
    headline: 'Stack Music\non Cities',
    sub: 'Discover unique sounds building by building in 3D cities',
    cta: 'Explore Map',
    login: 'Log In',
    join: 'Sign Up',
    statsLabel: ['Cities', 'Buildings', 'Genre Families'],
    features: [
      { icon: '◇', title: '6 Cities, 50,000+ Buildings', desc: 'Explore Tokyo · Seoul · LA · Manhattan in 3D' },
      { icon: '◆', title: 'Context-Aware AI Picks', desc: 'Weather · time · season · tenants shape your playlist' },
      { icon: '●', title: 'Real-Time Sync', desc: 'Live sun, weather, and charts reflected on the city' },
      { icon: '♬', title: '7 Genre Families', desc: '18 genres mapped to 7 distinct colors at a glance' },
    ],
    bottomCta: 'Ready to explore?',
    bottomBtn: 'Open Map',
  },
  ja: {
    brand: 'VIBE + BLOCK',
    headline: '都市の上に\n音楽を積む',
    sub: '3D都市でビルごとに異なる音楽を発見しよう',
    cta: 'マップを探検',
    login: 'ログイン',
    join: '新規登録',
    statsLabel: ['都市', 'ビル', 'ジャンル'],
    features: [
      { icon: '◇', title: '6都市、50,000+ビル', desc: '東京・ソウル・LA・マンハッタンを3Dで探検' },
      { icon: '◆', title: '環境適応AIレコメンド', desc: '天気・時間・季節・テナントがプレイリストを変える' },
      { icon: '●', title: 'リアルタイム同期', desc: '現在の太陽・天気・チャートが都市に反映' },
      { icon: '♬', title: '7ジャンルファミリー', desc: '18ジャンルを7色で一目で把握' },
    ],
    bottomCta: '今すぐ探検しよう',
    bottomBtn: 'マップを開く',
  },
};

const CITIES = [
  { label: '신주쿠', en: 'Shinjuku', ja: '新宿', area: 'shinjuku' },
  { label: '시부야', en: 'Shibuya', ja: '渋谷', area: 'shibuya' },
  { label: '이태원', en: 'Itaewon', ja: 'イテウォン', area: 'itaewon' },
  { label: '강남', en: 'Gangnam', ja: 'カンナム', area: 'gangnam' },
  { label: '맨해튼', en: 'Manhattan', ja: 'マンハッタン', area: 'manhattan' },
  { label: 'LA', en: 'LA', ja: 'LA', area: 'la' },
] as const;

const STATS = [
  { value: '6', key: 0 },
  { value: '50,000+', key: 1 },
  { value: '7', key: 2 },
] as const;

const DOTS = ['#ff2d6f', '#7b5cff', '#00b3c4', '#e89833', '#34a763', '#ff6b35', '#889cf5'];

export function LandingPage() {
  const lang = useI18nStore((s) => s.lang);
  const t = copy[lang];

  const cityLabel = (c: (typeof CITIES)[number]) =>
    lang === 'en' ? c.en : lang === 'ja' ? c.ja : c.label;

  return (
    <div style={{ background: C.bg, fontFamily: sans }} className="flex min-h-dvh flex-col">
      {/* ━━━ HERO ━━━ min-h-[100dvh], vertically centered */}
      <section className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden">
        {/* 3D city background — DO NOT TOUCH */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <div style={{ width: '100%', height: '100%' }}>
            <PlateauScene area="shinjuku" darkMode={true} />
          </div>
          <div className="absolute inset-0 backdrop-blur-[12px]" />
          <div className="absolute inset-0" style={{ background: 'rgba(10,10,15,0.60)' }} />
        </div>

        {/* Hero content — 720px unified grid container */}
        <div
          className="relative z-10 mx-auto flex w-full flex-col items-center text-center"
          style={{ maxWidth: 720, padding: '0 24px' }}
        >
          {/* Brand mark — 12px, 0.1em tracking, tertiary */}
          <p
            style={{
              fontFamily: mono,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.1em',
              color: C.tertiary,
              lineHeight: 1.4,
            }}
          >
            {t.brand}
          </p>

          {/* Headline — 48px gap, clamp 36–72px, weight 800, tight tracking */}
          <h1
            style={{
              marginTop: 48,          /* 6×8 */
              fontSize: 'clamp(2.25rem, 5vw + 1rem, 4.5rem)',
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: '-0.035em',
              color: C.primary,
              whiteSpace: 'pre-line',
            }}
          >
            {t.headline}
          </h1>

          {/* Subline — 24px gap, 18px, weight 400, secondary */}
          <p
            style={{
              marginTop: 24,          /* 3×8 */
              fontSize: 'clamp(1rem, 1vw + 0.75rem, 1.125rem)',
              fontWeight: 400,
              lineHeight: 1.6,
              color: C.secondary,
              maxWidth: 480,
            }}
          >
            {t.sub}
          </p>

          {/* Primary CTA — 40px gap, 16px font, 600 weight, min-h 48px (touch target) */}
          <Link
            to="/map"
            className="group"
            style={{
              marginTop: 40,          /* 5×8 */
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 32px',   /* 48px total height */
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: '-0.01em',
              background: C.cta,
              color: C.ctaText,
              boxShadow: '0 0 48px rgba(240,237,232,0.10)',
              transition: 'transform 150ms, box-shadow 150ms',
            }}
          >
            {t.cta}
            <span
              aria-hidden
              className="inline-block transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>

          {/* Secondary auth — 16px gap, 14px, weight 500, secondary */}
          <div
            style={{
              marginTop: 16,          /* 2×8 */
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: 14,
              fontWeight: 500,
              color: C.secondary,
            }}
          >
            <Link to="/login" className="transition-opacity hover:opacity-100" style={{ opacity: 0.7 }}>
              {t.login}
            </Link>
            <span style={{ color: C.muted }} aria-hidden>·</span>
            <Link to="/signup" className="transition-opacity hover:opacity-100" style={{ opacity: 0.7 }}>
              {t.join}
            </Link>
          </div>

          {/* City chips — 32px gap, 12px, weight 500, tertiary, min 44px touch */}
          <div
            style={{
              marginTop: 32,          /* 4×8 */
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {CITIES.map((c) => (
              <Link
                key={c.area}
                to={`/map?area=${c.area}`}
                className="transition-colors"
                style={{
                  padding: '8px 14px',  /* min 36px height */
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: C.surface,
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                  color: C.tertiary,
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.borderHover;
                  e.currentTarget.style.color = C.secondary;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.color = C.tertiary;
                }}
              >
                {cityLabel(c)}
              </Link>
            ))}
          </div>

          {/* Language switcher — 24px gap */}
          <div style={{ marginTop: 24 }}>
            <LanguageToggle darkMode />
          </div>
        </div>

        {/* Scroll hint — 10px, tertiary, pinned bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            fontFamily: mono,
            letterSpacing: '0.15em',
            color: C.tertiary,
          }}
        >
          SCROLL
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.5 }}>
            <path d="M7 1v10M3 8l4 4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* ━━━ STATS ━━━
           - Horizontal on all viewports (3 items fit comfortably)
           - Large numbers (clamp 40–64px) for visual impact
           - Labels 13px/600 with secondary color for readability
           - Number-to-label gap: 8px
           - Item-to-item gap: 48–64px with visible dividers
           - Section padding: 96px desktop / 64px mobile
      */}
      <section
        style={{
          padding: 'clamp(64px, 10vw, 96px) 24px',
          borderTop: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          className="mx-auto"
          style={{
            maxWidth: 720,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0,
          }}
        >
          {STATS.map((s, i) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && (
                <div
                  style={{
                    width: 1,
                    height: 56,
                    margin: '0 clamp(24px, 5vw, 56px)',
                    background: 'rgba(255,255,255,0.12)',
                  }}
                />
              )}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,             /* 1×8 — number to label */
                  minWidth: 72,
                }}
              >
                {/* Stat number — large, bold, mono */}
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 'clamp(1.75rem, 4vw, 3.5rem)',
                    fontWeight: 800,
                    lineHeight: 1,
                    color: C.primary,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {s.value}
                </span>
                {/* Stat label — readable, secondary opacity */}
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: C.secondary,
                    lineHeight: 1,
                  }}
                >
                  {t.statsLabel[s.key]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ━━━ BENTO FEATURES ━━━
           - 64px top gap from stats, 128px bottom gap
           - 16px card gap, max-w 720px
      */}
      <section style={{ padding: 'clamp(48px, 8vw, 64px) 24px clamp(64px, 10vw, 96px)' }}>
        <div
          className="mx-auto grid grid-cols-1 sm:grid-cols-2"
          style={{ maxWidth: 720, gap: 16 }}
        >
          {t.features.map((f, i) => (
            <div
              key={i}
              className="transition-colors"
              style={{
                padding: 24,             /* 3×8 */
                borderRadius: 16,
                border: `1px solid ${C.border}`,
                background: C.surface,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = C.surface;
              }}
            >
              {/* Icon — 24px, 16px bottom margin */}
              <div
                style={{
                  marginBottom: 16,
                  fontSize: 24,
                  lineHeight: 1,
                  ...(f.icon === '◆'
                    ? { color: '#ff2d6f', fontWeight: 700 }
                    : f.icon === '●'
                    ? { color: '#4CAF50' }
                    : {}),
                }}
              >
                {f.icon === '♬' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {DOTS.map((d) => (
                      <span
                        key={d}
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: d,
                        }}
                      />
                    ))}
                  </span>
                ) : (
                  f.icon
                )}
              </div>
              {/* Title — 16px, 600, primary */}
              <h3
                style={{
                  marginBottom: 8,       /* 1×8 */
                  fontSize: 16,
                  fontWeight: 600,
                  lineHeight: 1.3,
                  color: C.primary,
                }}
              >
                {f.title}
              </h3>
              {/* Desc — 14px, 400, secondary, 1.6 line-height */}
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 400,
                  lineHeight: 1.6,
                  color: C.secondary,
                }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ━━━ BOTTOM CTA ━━━ */}
      <section
        className="flex flex-col items-center text-center"
        style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px clamp(64px, 8vw, 96px)', width: '100%', boxSizing: 'border-box' }}
      >
        {/* Heading — clamp 20–28px, 700, primary */}
        <p
          style={{
            marginBottom: 24,           /* 3×8 */
            fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)',
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
            color: C.primary,
          }}
        >
          {t.bottomCta}
        </p>
        {/* Ghost CTA — 16px font, 48px height */}
        <Link
          to="/map"
          className="group"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 32px',
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            background: C.surface,
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: '-0.01em',
            color: C.primary,
            transition: 'border-color 150ms, background 150ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = C.borderHover;
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = C.border;
            e.currentTarget.style.background = C.surface;
          }}
        >
          {t.bottomBtn}
          <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">
            →
          </span>
        </Link>

        {/* Footer — 10px mono, muted */}
        <p
          style={{
            marginTop: 96,             /* 12×8 */
            fontFamily: mono,
            fontSize: 10,
            letterSpacing: '0.12em',
            color: C.muted,
          }}
        >
          © 2026 VIBLOC
        </p>
      </section>
    </div>
  );
}
