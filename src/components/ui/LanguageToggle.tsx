import { useI18nStore, type Lang } from '../../lib/app/i18n';

type Props = {
  darkMode?: boolean;
};

const OPTIONS: { key: Lang; label: string }[] = [
  { key: 'en', label: 'EN' },
  { key: 'ko', label: '한' },
  { key: 'ja', label: '日' },
];

/**
 * Compact 3-way language switcher (EN / 한 / 日). Sits in the top bar.
 * Persists the user's choice via the i18n Zustand store, which writes to
 * `localStorage` under `vibloc.lang`.
 */
export function LanguageToggle({ darkMode = false }: Props) {
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);
  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'flex',
        gap: 4,
        padding: 4,
        borderRadius: 12,
        background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: darkMode ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.06)',
        border: darkMode ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.06)',
        transition: 'all 0.4s ease',
      }}
    >
      {OPTIONS.map((opt) => {
        const active = lang === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => setLang(opt.key)}
            aria-pressed={active}
            style={{
              minWidth: 32,
              padding: '4px 8px',
              borderRadius: 8,
              border: 'none',
              background: active
                ? (darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(14,14,26,0.10)')
                : 'transparent',
              color: darkMode ? '#e0e0e8' : '#0e0e1a',
              fontFamily: "'SF Mono', ui-monospace, 'IBM Plex Mono', Menlo, monospace",
              fontSize: 11,
              fontWeight: active ? 800 : 500,
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
