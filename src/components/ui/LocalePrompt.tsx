/**
 * Locale-aware first-visit prompt.
 *
 * Source: 2026-04-09 UI/UX research, J.3 (Visit Seoul Navigation Apps
 * Guide 2026), J.4 (KR/JP info-density norms). 4 of 6 cities in
 * VIBLOC are JP/KR, so when an English user clicks one of them for
 * the first time we suggest switching the UI language. The prompt
 * is one-shot per (city-country, target-lang) pair — once dismissed,
 * never shown again.
 *
 * No tracking, no network. localStorage flag only.
 */

import { useEffect, useState } from 'react';
import { useI18nStore, type Lang } from '../../lib/app/i18n';
import type { CityAreaKey } from '../../lib/geo/osmLoader';

const STORAGE_KEY = 'vibloc_locale_prompt_v1';

const CITY_LANG: Partial<Record<CityAreaKey, Lang>> = {
  shinjuku: 'ja',
  shibuya: 'ja',
  gangnam: 'ko',
  itaewon: 'ko',
};

const COPY: Record<Lang, { headline: string; sub: string; yes: string; no: string }> = {
  ko: {
    headline: '한국어로 보시겠어요?',
    sub: '한국 도시에 더 잘 맞춰드릴게요.',
    yes: '예, 한국어로',
    no: '괜찮아요',
  },
  ja: {
    headline: '日本語に切り替えますか？',
    sub: '日本の街にぴったりの表示にします。',
    yes: 'はい',
    no: 'そのまま',
  },
  en: {
    headline: 'Switch language?',
    sub: '',
    yes: 'Yes',
    no: 'No',
  },
};

export function LocalePrompt({
  area,
  darkMode,
}: {
  area: CityAreaKey;
  darkMode: boolean;
}) {
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  const [show, setShow] = useState(false);
  const [target, setTarget] = useState<Lang | null>(null);

  useEffect(() => {
    const desired = CITY_LANG[area];
    if (!desired) { setShow(false); return; }
    if (lang === desired) { setShow(false); return; }
    let dismissed: string[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) dismissed = JSON.parse(raw);
    } catch { /* ignore */ }
    const key = `${area}:${desired}`;
    if (dismissed.includes(key)) { setShow(false); return; }
    setTarget(desired);
    setShow(true);
  }, [area, lang]);

  const persistDismiss = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const key = `${area}:${target}`;
      if (!list.includes(key)) list.push(key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
    setShow(false);
  };

  if (!show || !target) return null;
  const copy = COPY[target];

  return (
    <div
      role="dialog"
      aria-label={copy.headline}
      style={{
        position: 'fixed',
        top: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 90,
        padding: '12px 18px',
        borderRadius: 14,
        background: darkMode ? 'rgba(20,20,28,0.92)' : 'rgba(255,255,255,0.94)',
        border: darkMode ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.10)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        boxShadow: darkMode ? '0 12px 40px rgba(0,0,0,0.55)' : '0 12px 40px rgba(15,23,42,0.18)',
        fontFamily: "'IBM Plex Mono', monospace",
        color: darkMode ? '#f5f5f7' : '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 420,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3 }}>{copy.headline}</div>
        {copy.sub && (
          <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>{copy.sub}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => { setLang(target); persistDismiss(); }}
        style={{
          padding: '6px 12px',
          borderRadius: 10,
          border: 'none',
          background: darkMode ? '#f5f5f7' : '#1a1a2e',
          color: darkMode ? '#0a0a0f' : '#fff',
          fontSize: 11,
          fontWeight: 800,
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {copy.yes}
      </button>
      <button
        type="button"
        onClick={persistDismiss}
        style={{
          padding: '6px 10px',
          borderRadius: 10,
          border: `1px solid ${darkMode ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)'}`,
          background: 'transparent',
          color: 'inherit',
          fontSize: 10.5,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {copy.no}
      </button>
    </div>
  );
}
