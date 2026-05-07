import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18nStore, type Lang } from '@/lib/app/i18n';
import { PlateauScene } from '@/components/canvas/PlateauScene';
import { Globe, Sparkles, Activity, Music, type LucideIcon } from 'lucide-react';

/** Lucide icon registry — keeps i18n copy semantic, not emoji-coupled. */
type FeatureIconKey = 'globe' | 'sparkles' | 'pulse' | 'music';
const FEATURE_ICON: Record<FeatureIconKey, LucideIcon> = {
  globe: Globe,
  sparkles: Sparkles,
  pulse: Activity,
  music: Music,
};

/* ── Apple Design System reference ──
 * Source: apple.com (iPhone 16 Pro / MacBook Pro pages), HIG typography.
 *
 * 1. Single typeface: SF Pro stack, Pretendard fallback for Korean.
 * 2. Three weights only: 400 regular / 600 semibold / 700 bold.
 * 3. Negative letter-spacing on display (Apple's optical tracking).
 * 4. Pure-black hero (#000) with subtle 3D backdrop, neutral whites
 *    (#fbfbfd, #f5f5f7) for body sections, divider 7% black.
 * 5. Apple Blue reserved for primary action (#0071e3 light, #2997ff dark).
 * 6. Pill buttons (border-radius 980), hover via fill darken not shadow.
 * 7. Cards have no border — only background contrast against the
 *    section gray, plus a 1px translate-up on hover.
 */
const fontStack =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Pretendard Variable", "Pretendard", "Inter", sans-serif';

const C = {
  // Hero (dark)
  heroBg: '#000000',
  heroPrimary: '#f5f5f7',
  heroSecondary: 'rgba(245,245,247,0.72)',
  heroMuted: 'rgba(245,245,247,0.42)',
  // Body sections (light)
  bg: '#fbfbfd',
  bgAlt: '#f5f5f7',
  cardBg: '#ffffff',
  primary: '#1d1d1f',
  secondary: '#6e6e73',
  divider: 'rgba(0,0,0,0.07)',
  // Action — neutral INK-based palette (blue suppressed per design
  // direction). Names preserved for backward compatibility, values
  // shifted to ink/cream so primary CTAs read as high-contrast
  // black-on-white in light theme, white-on-black in dark theme.
  blue: '#0e0e1a',
  blueHover: '#2a2a35',
  blueDark: '#f5f5f7',
} as const;

/* Apple type scale — sizes & tracking lifted from apple.com computed
 * styles, mapped onto a tight 7-step ladder. */
const T = {
  display: {
    fontSize: 'clamp(40px, 6.5vw, 80px)',
    fontWeight: 700,
    letterSpacing: '-0.005em',
    lineHeight: 1.05,
  },
  headline: {
    fontSize: 'clamp(28px, 3.5vw, 48px)',
    fontWeight: 700,
    letterSpacing: '-0.003em',
    lineHeight: 1.08,
  },
  title: {
    fontSize: 21,
    fontWeight: 600,
    letterSpacing: '0.011em',
    lineHeight: 1.19,
  },
  subhead: {
    fontSize: 'clamp(17px, 1.4vw, 21px)',
    fontWeight: 400,
    letterSpacing: '0.011em',
    lineHeight: 1.4,
  },
  body: {
    fontSize: 17,
    fontWeight: 400,
    letterSpacing: '-0.022em',
    lineHeight: 1.47,
  },
  caption: {
    fontSize: 14,
    fontWeight: 400,
    letterSpacing: '-0.016em',
    lineHeight: 1.286,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.06em',
    lineHeight: 1.33,
    textTransform: 'uppercase' as const,
  },
} as const;

/* ── i18n copy ── */
const copy: Record<
  Lang,
  {
    headline: string;
    sub: string;
    ctaPrimary: string;
    ctaSecondary: string;
    statsLabel: [string, string, string];
    citiesEyebrow: string;
    citiesHeadline: string;
    featuresEyebrow: string;
    featuresHeadline: string;
    features: { icon: FeatureIconKey; title: string; desc: string }[];
    bottomEyebrow: string;
    bottomHeadline: string;
    bottomSub: string;
    bottomCta: string;
    login: string;
    join: string;
  }
> = {
  ko: {
    headline: '도시 위에\n음악을 쌓다.',
    sub: '3D 도시에서 건물마다 다른 음악을 발견하세요.',
    ctaPrimary: '맵 탐험하기',
    ctaSecondary: '더 알아보기',
    statsLabel: ['도시', '건물', '장르 패밀리'],
    citiesEyebrow: '6개 도시',
    citiesHeadline: '도시를 선택하세요.',
    featuresEyebrow: '주요 기능',
    featuresHeadline: '음악을 위해 설계되었습니다.',
    features: [
      { icon: 'globe', title: '6개 도시, 50,000+ 건물', desc: '도쿄·서울·LA·맨해튼을 3D로 탐험합니다.' },
      { icon: 'sparkles', title: '환경 맞춤 AI 추천', desc: '날씨·시간·계절·테넌트가 플레이리스트를 바꿉니다.' },
      { icon: 'pulse', title: '실시간 동기화', desc: '현재 시간의 태양·날씨·차트가 도시에 반영됩니다.' },
      { icon: 'music', title: '7 장르 패밀리', desc: '18개 장르를 7가지 색으로 한눈에 봅니다.' },
    ],
    bottomEyebrow: '지금 시작',
    bottomHeadline: '도시를 열고\n음악을 발견하세요.',
    bottomSub: '회원가입 없이 바로 탐험할 수 있습니다.',
    bottomCta: '맵 열기',
    login: '로그인',
    join: '회원가입',
  },
  en: {
    headline: 'Stack music\non cities.',
    sub: 'Discover unique sounds building by building in 3D cities.',
    ctaPrimary: 'Explore Map',
    ctaSecondary: 'Learn more',
    statsLabel: ['Cities', 'Buildings', 'Genre Families'],
    citiesEyebrow: '6 Cities',
    citiesHeadline: 'Pick a city.',
    featuresEyebrow: 'Key Features',
    featuresHeadline: 'Built for sound.',
    features: [
      { icon: 'globe', title: '6 cities, 50,000+ buildings', desc: 'Explore Tokyo, Seoul, LA, and Manhattan in 3D.' },
      { icon: 'sparkles', title: 'Context-aware AI picks', desc: 'Weather, time, season, and tenants shape your playlist.' },
      { icon: 'pulse', title: 'Real-time sync', desc: 'Live sun, weather, and charts reflected on the city.' },
      { icon: 'music', title: '7 genre families', desc: '18 genres mapped to 7 distinct colors at a glance.' },
    ],
    bottomEyebrow: 'Get started',
    bottomHeadline: 'Open the city.\nDiscover the sound.',
    bottomSub: 'No sign-up required to start exploring.',
    bottomCta: 'Open Map',
    login: 'Log In',
    join: 'Sign Up',
  },
  ja: {
    headline: '都市の上に\n音楽を積む。',
    sub: '3D都市でビルごとに異なる音楽を発見しよう。',
    ctaPrimary: 'マップを探検',
    ctaSecondary: '詳しく見る',
    statsLabel: ['都市', 'ビル', 'ジャンル'],
    citiesEyebrow: '6都市',
    citiesHeadline: '都市を選ぼう。',
    featuresEyebrow: '主な機能',
    featuresHeadline: '音のために。',
    features: [
      { icon: 'globe', title: '6都市、50,000+ビル', desc: '東京・ソウル・LA・マンハッタンを3Dで探検します。' },
      { icon: 'sparkles', title: '環境適応AIレコメンド', desc: '天気・時間・季節・テナントがプレイリストを変えます。' },
      { icon: 'pulse', title: 'リアルタイム同期', desc: '現在の太陽・天気・チャートが都市に反映されます。' },
      { icon: 'music', title: '7ジャンルファミリー', desc: '18ジャンルを7色で一目で把握します。' },
    ],
    bottomEyebrow: '今すぐ始める',
    bottomHeadline: '都市を開いて\n音楽を発見しよう。',
    bottomSub: 'サインアップなしで探検開始。',
    bottomCta: 'マップを開く',
    login: 'ログイン',
    join: '新規登録',
  },
};

// US → KR → JP — same order as `CITY_AREAS` and the left-rail
// Cities list, so a user scanning the chip strip sees the same
// sequence everywhere.
const CITIES = [
  { label: '맨해튼', en: 'Manhattan', ja: 'マンハッタン', area: 'manhattan' },
  { label: 'LA', en: 'LA', ja: 'LA', area: 'la' },
  { label: '이태원', en: 'Itaewon', ja: 'イテウォン', area: 'itaewon' },
  { label: '강남', en: 'Gangnam', ja: 'カンナム', area: 'gangnam' },
  { label: '신주쿠', en: 'Shinjuku', ja: '新宿', area: 'shinjuku' },
  { label: '시부야', en: 'Shibuya', ja: '渋谷', area: 'shibuya' },
] as const;

const STATS = [
  { value: '6', key: 0 },
  { value: '50,000+', key: 1 },
  { value: '7', key: 2 },
] as const;

/* Compact Apple-style language pill row for the hero. Dark surface
 * only — the active language gets a frosted-white fill, the others
 * stay muted with a hover lift. Sits in the same 720 px vertical
 * column as the rest of the hero copy so it lines up perfectly with
 * the headline / CTA / login row above. */
const LANG_OPTIONS: { key: Lang; label: string }[] = [
  { key: 'en', label: 'EN' },
  { key: 'ko', label: '한' },
  { key: 'ja', label: '日' },
];

function HeroLanguageSwitch() {
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        borderRadius: 980,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      }}
    >
      {LANG_OPTIONS.map((opt) => {
        const active = lang === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setLang(opt.key)}
            aria-pressed={active}
            style={{
              minWidth: 32,
              height: 26,
              padding: '0 10px',
              borderRadius: 980,
              border: 'none',
              background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
              color: active ? '#ffffff' : 'rgba(245,245,247,0.7)',
              fontFamily: 'inherit',
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              letterSpacing: '-0.01em',
              cursor: 'pointer',
              transition: 'background 120ms ease, color 120ms ease',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = 'rgba(245,245,247,0.7)';
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* Apple primary pill — fill darken on hover, no shadow.
 * `onDark`: use the cream-on-dark variant when the button sits on
 * a dark surface (hero, bottom CTA band). Without it, INK-on-dark
 * collapses to invisible. */
function PillButton({
  to, children, onDark = false,
}: {
  to: string;
  children: React.ReactNode;
  onDark?: boolean;
}) {
  const fill = onDark ? C.blueDark : C.blue;
  const fillHover = onDark ? '#e0e0e8' : C.blueHover;
  const ink = onDark ? '#0e0e1a' : '#ffffff';
  return (
    <Link
      to={to}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px 22px',
        borderRadius: 980,
        background: fill,
        color: ink,
        ...T.body,
        lineHeight: 1.176,
        textDecoration: 'none',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = fillHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = fill; }}
    >
      {children}
    </Link>
  );
}

/** Decorative backdrop for the FEATURES section. Renders a stylized
 *  preview of VIBLOC's right-rail music UI: two columns of "track
 *  rows" (album-art tile + two skeleton text bars) anchored to the
 *  section's left and right edges at low opacity. The cards in the
 *  foreground stay fully readable because the rows are masked with
 *  a vertical fade and never invade the central column. */
function FeaturesMusicBackdrop() {
  // Pre-baked hue list for the album tiles — the same Apple Music-
  // genre palette (red / pink / blue / mint / yellow) sampled
  // randomly per row. Keeping the list inline avoids pulling in
  // GENRE_COLORS just for decoration.
  const HUES = [355, 320, 220, 165, 50, 280, 12, 200];
  const rows = Array.from({ length: 7 }, (_, i) => HUES[i % HUES.length]);
  const rowStack = (side: 'left' | 'right') => (
    <div
      style={{
        position: 'absolute',
        top: 0, bottom: 0,
        ...(side === 'left' ? { left: 0 } : { right: 0 }),
        width: 'clamp(220px, 24vw, 320px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 12,
        padding: '40px 20px',
        // Vertical mask — fade the top + bottom of each column so
        // the rows seem to "drift" into the section rather than
        // being clipped at hard edges.
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
      }}
    >
      {rows.map((hue, idx) => (
        <div
          key={`${side}-${idx}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 12px',
            borderRadius: 6,
            background: 'rgba(14,14,26,0.04)',
          }}
        >
          {/* Album-art tile — solid color sample */}
          <span style={{
            width: 36, height: 36, borderRadius: 4, flexShrink: 0,
            background: `hsl(${hue}, 65%, 62%)`,
          }} />
          {/* Two skeleton text bars — title (full) + caption (short) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{
              height: 8, width: '78%', borderRadius: 4,
              background: 'rgba(14,14,26,0.15)',
            }} />
            <span style={{
              height: 6, width: '52%', borderRadius: 4,
              background: 'rgba(14,14,26,0.10)',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        opacity: 0.55,
      }}
    >
      {rowStack('left')}
      {rowStack('right')}
    </div>
  );
}

export function LandingPage() {
  const lang = useI18nStore((s) => s.lang);
  const t = copy[lang];

  // R3F's react-use-measure occasionally misses the initial size on
  // dvh-based parents, leaving the hero canvas stuck at its 300×150
  // HTML default and exposing the page background around it. Nudge a
  // window resize after mount so the canvas backing buffer matches
  // the hero wrapper's actual dimensions.
  useEffect(() => {
    // Fire several times — R3F's resize observer may attach on a later
    // frame than ours, so a single rAF dispatch is sometimes too early.
    const timers = [0, 50, 200, 600].map((d) =>
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), d),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const cityLabel = (c: (typeof CITIES)[number]) =>
    lang === 'en' ? c.en : lang === 'ja' ? c.ja : c.label;

  return (
    <div style={{ background: C.bg, fontFamily: fontStack, color: C.primary, width: '100%', boxSizing: 'border-box' }}>
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          HERO — pure black, vertically centered, single
          dominant CTA + text link. iPhone product page
          pattern.
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        style={{
          position: 'relative',
          minHeight: '100dvh',
          background: C.heroBg,
          color: C.heroPrimary,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
          }}
        >
          <PlateauScene area="manhattan" darkMode={true} interactive={false} introAnimation />
          {/* Blur + scrim animate IN as the camera zoom-in finishes,
              giving the impression that the city "softens" while
              the marketing copy fades in on top.
              CSS keyframes inline → no global stylesheet pollution. */}
          <div className="vbk-hero-blur" style={{ position: 'absolute', inset: 0 }} />
          <div className="vbk-hero-scrim" style={{ position: 'absolute', inset: 0, background: '#000' }} />
          <style>{`
            @keyframes vbk-hero-blur-in {
              0%   { backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }
              100% { backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
            }
            @keyframes vbk-hero-scrim-in {
              0%   { opacity: 0; }
              100% { opacity: 0.55; }
            }
            @keyframes vbk-hero-content-in {
              0%   { opacity: 0; transform: translateY(12px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            .vbk-hero-blur {
              animation: vbk-hero-blur-in 900ms cubic-bezier(0.2, 0.7, 0.2, 1) 1300ms both;
            }
            .vbk-hero-scrim {
              opacity: 0;
              animation: vbk-hero-scrim-in 1000ms cubic-bezier(0.2, 0.7, 0.2, 1) 1200ms both;
            }
            /* Hero content stagger — direct children animate in
               sequence as the 2 s camera intro finishes. */
            .vbk-hero-content > * {
              opacity: 0;
              animation: vbk-hero-content-in 600ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
            }
            .vbk-hero-content > *:nth-child(1) { animation-delay: 1700ms; }
            .vbk-hero-content > *:nth-child(2) { animation-delay: 1850ms; }
            .vbk-hero-content > *:nth-child(3) { animation-delay: 2000ms; }
            .vbk-hero-content > *:nth-child(4) { animation-delay: 2150ms; }
            .vbk-hero-content > *:nth-child(n+5) { animation-delay: 2300ms; }
            @media (prefers-reduced-motion: reduce) {
              .vbk-hero-blur,
              .vbk-hero-scrim,
              .vbk-hero-content { animation: none; opacity: 1; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
              .vbk-hero-scrim { opacity: 0.55; }
            }
          `}</style>
        </div>

        <div
          className="vbk-hero-content"
          style={{
            position: 'relative',
            zIndex: 1,
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '120px 22px 80px',
          }}
        >
          <h1
            style={{
              ...T.display,
              color: C.heroPrimary,
              maxWidth: 980,
              whiteSpace: 'pre-line',
              margin: '0 auto',
              textAlign: 'center',
            }}
          >
            {t.headline}
          </h1>
          <p
            style={{
              ...T.subhead,
              color: C.heroSecondary,
              marginTop: 16,
              marginBottom: 0,
              marginLeft: 'auto',
              marginRight: 'auto',
              maxWidth: 720,
              textAlign: 'center',
            }}
          >
            {t.sub}
          </p>

          <div
            style={{
              marginTop: 32,
              marginLeft: 'auto',
              marginRight: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 28,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <PillButton to="/map" onDark>{t.ctaPrimary}</PillButton>
            {/* "Learn more" link removed — the bottom-center scroll
                cue (rendered after the section content) replaces it
                with a clearer single signal. */}
          </div>

          {/* Auth row — symmetric grid so the · separator sits at the
              exact optical center regardless of label width (Log In is
              ~38 px, Sign Up ~49 px, so a plain flex+gap pushes the
              dot ~5 px left of true center). 1fr / auto / 1fr with the
              labels justified inward keeps everything balanced around
              the dot. */}
          {/* Auth row — width-locked to ≈ the Explore Map pill so
              `Log In` aligns with the pill's LEFT edge and `Sign Up`
              with the RIGHT edge. The "/" separator floats in the
              middle. justifySelf flipped to start / end (was end /
              start) so the labels push OUTWARD to the row edges
              instead of inward toward the dot.
              28 px top/bottom gap keeps the row centered between
              the Explore Map CTA and the Language switcher. */}
          <div
            style={{
              marginTop: 28,
              marginLeft: 'auto',
              marginRight: 'auto',
              width: 184,
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              columnGap: 18,
              ...T.caption,
              color: C.heroMuted,
              textAlign: 'center',
            }}
          >
            <Link
              to="/login"
              style={{ color: C.heroMuted, textDecoration: 'none', justifySelf: 'start' }}
            >
              {t.login}
            </Link>
            <span aria-hidden style={{ opacity: 0.45 }}>/</span>
            <Link
              to="/signup"
              style={{ color: C.heroMuted, textDecoration: 'none', justifySelf: 'end' }}
            >
              {t.join}
            </Link>
          </div>

          {/* Language switch — sits in the same hero column, 20 px
              below the auth row, so the entire stack (headline →
              sub → CTA → auth → language) reads as one centered
              unit on the 720 px grid. */}
          {/* Language switcher — same 28 px gap as above so the
              auth row sits perfectly centered between Explore Map
              and this language pill stack. */}
          <div style={{
            marginTop: 28,
            marginLeft: 'auto',
            marginRight: 'auto',
            display: 'flex',
            justifyContent: 'center',
          }}>
            <HeroLanguageSwitch />
          </div>
        </div>

        {/* Scroll cue — purely decorative. A double chevron-down
            with a soft bounce loop signals "scroll for more". Was
            an <a href="#features"> but the click jump felt like a
            navigation step the user didn't want; now it's a non-
            interactive hint that disappears as soon as the user
            actually starts scrolling. */}
        <div
          aria-hidden="true"
          className="vbk-scroll-cue"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 32,
            transform: 'translateX(-50%)',
            zIndex: 2,
            color: C.heroSecondary,
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: -6,
            padding: '8px 12px',
            pointerEvents: 'none',
          }}
        >
          {/* Label above the chevrons — quiet caption-tier text so
              the cue reads as "Learn more ↓" without competing with
              the primary CTA. Caption sized to match the rail's
              ROW_CAPTION typography. */}
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: 8,
              color: 'inherit',
            }}
          >
            {t.ctaSecondary}
          </span>
          {/* Two stacked chevron-downs — common "more below" cue
              (Apple Music macOS, Spotify Wrapped story). Stroke 2
              keeps it visible against the dark scrim without
              competing with the headline weight. */}
          <svg width="20" height="14" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
            <path d="m4 4 8 7 8-7" />
          </svg>
          <svg width="20" height="14" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', marginTop: -6, opacity: 0.65 }}>
            <path d="m4 4 8 7 8-7" />
          </svg>
        </div>
        <style>{`
          @keyframes vbk-scroll-cue-bounce {
            0%, 100% { transform: translateX(-50%) translateY(0); }
            50%      { transform: translateX(-50%) translateY(6px); }
          }
          .vbk-scroll-cue {
            animation: vbk-scroll-cue-bounce 1800ms ease-in-out infinite;
            animation-delay: 2200ms;
            opacity: 0;
            animation-name: vbk-scroll-cue-bounce, vbk-scroll-cue-fade;
            animation-duration: 1800ms, 600ms;
            animation-iteration-count: infinite, 1;
            animation-fill-mode: both, both;
          }
          @keyframes vbk-scroll-cue-fade {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          /* Hover effect removed — the cue is no longer clickable. */
          @media (prefers-reduced-motion: reduce) {
            .vbk-scroll-cue { animation: none; transform: translateX(-50%); opacity: 1; }
          }
        `}</style>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          CITY BACKDROP — wraps STATS + CITIES only. Manhattan
          canvas sits behind both sections; gradient progressively
          whitens so the city is visible behind STATS and fades
          to solid white by the end of CITIES. FEATURES below has
          its own music-themed backdrop.
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={{ position: 'relative', background: C.bg, overflow: 'hidden' }}>
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <PlateauScene
            area="manhattan"
            darkMode={false}
            interactive={false}
            staticCameraView={{ position: [0, 1600, 1300], target: [0, 0, 0] }}
          />
          {/* Gradient tightened: STATS holds the city visible,
              CITIES softens to ~85 %, then settles to solid bg by
              the wrapper bottom (= end of CITIES). */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(to bottom,
              rgba(255,255,255,0.30) 0%,
              rgba(255,255,255,0.50) 30%,
              rgba(255,255,255,0.78) 65%,
              rgba(255,255,255,0.94) 88%,
              ${C.bg} 100%)`,
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }} />
        </div>

      <section
        style={{
          position: 'relative',
          zIndex: 1,
          height: 'clamp(420px, 50vh, 620px)',
        }}
      >

        {/* STATS — 3-column grid centered over the city. */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            margin: '0 auto',
            maxWidth: 980,
            height: '100%',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            alignItems: 'center',
            padding: '0 22px',
          }}
        >
          {STATS.map((s, i) => (
            <div
              key={s.key}
              style={{
                textAlign: 'center',
                padding: '0 16px',
                borderLeft: i === 0 ? 'none' : `1px solid ${C.divider}`,
              }}
            >
              <div
                style={{
                  fontSize: 'clamp(48px, 7vw, 96px)',
                  fontWeight: 700,
                  letterSpacing: '-0.005em',
                  lineHeight: 1,
                  color: C.primary,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  ...T.body,
                  color: C.secondary,
                  marginTop: 14,
                }}
              >
                {t.statsLabel[s.key]}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Centered short divider — sits between STATS and CITIES,
          INSIDE the shared backdrop wrapper. Needs `position:
          relative` + `zIndex: 1` to stack above the absolute
          gradient layer; otherwise the gradient hides it. */}
      <div
        aria-hidden="true"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 240,
          height: 1,
          margin: '0 auto',
          background: C.divider,
        }}
      />

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          CITIES — sits over the same shared backdrop. Background
          transparent so the gradient (mid-stop ~60 % white) bleeds
          through and the city softly underlies the chips.
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section
        style={{
          position: 'relative',
          zIndex: 1,
          background: 'transparent',
          padding: 'clamp(80px, 10vw, 120px) 22px',
        }}
        >
        <div style={{ margin: '0 auto', maxWidth: 980, textAlign: 'center' }}>
          <p style={{ ...T.eyebrow, color: C.secondary, margin: 0 }}>
            {t.citiesEyebrow}
          </p>
          <h2
            style={{
              ...T.headline,
              color: C.primary,
              marginTop: 12,
              marginBottom: 0,
            }}
          >
            {t.citiesHeadline}
          </h2>
          <div
            style={{
              marginTop: 44,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            {CITIES.map((c) => (
              <Link
                key={c.area}
                to={`/map?area=${c.area}`}
                style={{
                  padding: '10px 22px',
                  borderRadius: 980,
                  background: C.cardBg,
                  border: `1px solid ${C.divider}`,
                  ...T.body,
                  fontWeight: 500,
                  color: C.primary,
                  textDecoration: 'none',
                  lineHeight: 1.176,
                  transition: 'border-color 120ms ease, transform 120ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.primary;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.divider;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {cityLabel(c)}
              </Link>
            ))}
          </div>
        </div>
      </section>
      </div>{/* /shared city backdrop wrapper — ends at CITIES */}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          FEATURES — borderless white cards on light bg,
          large icon + title + body. Apple "Designed for"
          grid pattern.
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* Centered short divider — same 240-px hairline pattern as
          between STATS and CITIES so all section breaks share one
          visual rule. */}
      <div
        aria-hidden="true"
        style={{
          width: 240,
          height: 1,
          margin: '0 auto',
          background: C.divider,
        }}
      />

      <section
        id="features"
        style={{
          position: 'relative',
          background: C.bg,
          padding: 'clamp(80px, 10vw, 120px) 22px',
          overflow: 'hidden',
        }}
      >
        {/* Music-panel decorative backdrop — a stylized mock of the
            right-rail music UI floats behind the feature cards.
            Two columns of "track rows" (artwork tile + two text
            bars) drift across the section's left and right edges
            at low opacity so the foreground cards stay readable. */}
        <FeaturesMusicBackdrop />

        <div style={{ position: 'relative', zIndex: 1, margin: '0 auto', maxWidth: 980 }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <p style={{ ...T.eyebrow, color: C.secondary, margin: 0 }}>
              {t.featuresEyebrow}
            </p>
            <h2 style={{ ...T.headline, color: C.primary, marginTop: 12, marginBottom: 0 }}>
              {t.featuresHeadline}
            </h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 20,
            }}
          >
            {t.features.map((f, i) => {
              const Icon = FEATURE_ICON[f.icon];
              return (
                <div
                  key={i}
                  style={{
                    background: C.cardBg,
                    borderRadius: 28,
                    padding: 36,
                    transition: 'transform 160ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ marginBottom: 24, color: C.primary }}>
                    <Icon size={32} strokeWidth={1.5} />
                  </div>
                  <h3 style={{ ...T.title, color: C.primary, margin: 0, marginBottom: 8 }}>
                    {f.title}
                  </h3>
                  <p style={{ ...T.body, color: C.secondary, margin: 0 }}>
                    {f.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          BOTTOM CTA — black band w/ blue eyebrow + bold
          headline + sub + single dominant pill. Apple's
          "Take the next step" closing pattern.
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* Centered short divider — same pattern as the STATS↔CITIES
          and CITIES↔FEATURES breaks. Light divider on light bg
          keeps the visual rhythm consistent across the whole page. */}
      <div
        aria-hidden="true"
        style={{
          width: 240,
          height: 1,
          margin: '0 auto',
          background: C.divider,
        }}
      />

      <section
        style={{
          background: C.heroBg,
          color: C.heroPrimary,
          padding: 'clamp(96px, 12vw, 140px) 22px',
        }}
      >
        <div style={{ margin: '0 auto', maxWidth: 720, textAlign: 'center' }}>
          <p style={{ ...T.eyebrow, color: C.blueDark, margin: 0 }}>
            {t.bottomEyebrow}
          </p>
          <h2
            style={{
              ...T.headline,
              color: C.heroPrimary,
              marginTop: 12,
              marginBottom: 0,
              whiteSpace: 'pre-line',
            }}
          >
            {t.bottomHeadline}
          </h2>
          <p
            style={{
              ...T.subhead,
              color: C.heroSecondary,
              marginTop: 16,
              marginBottom: 32,
            }}
          >
            {t.bottomSub}
          </p>
          <PillButton to="/map">{t.bottomCta}</PillButton>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          FOOTER — Apple-minimal: just ©. Language switch
          moved to the hero (right under the auth row) so
          users see it immediately without scrolling all
          the way down.
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer
        style={{
          background: C.bgAlt,
          padding: '36px 22px 40px',
          textAlign: 'center',
        }}
      >
        <p style={{ ...T.caption, color: C.secondary, margin: 0 }}>
          © 2026 VIBLOC
        </p>
      </footer>
    </div>
  );
}
