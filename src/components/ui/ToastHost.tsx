/**
 * ToastHost — renders queued toasts at bottom-center of the viewport.
 *
 * Mounted once near the app root. Toasts arrive via `showToast()` from
 * `lib/ui/toast.ts`; this component subscribes via `useToasts()` and
 * animates each item with a quick fade + slide-up.
 *
 * Visual spec:
 *   • Sans 13 / -0.01em — same body type as Apple Music macOS HUD
 *   • Pill 12 px radius, 1 px hairline, blurred backdrop on dark
 *   • Stack from bottom: newest sits on top of older toasts
 *   • Auto-dismiss handled by the toast store; this is just the view
 */
import { useDarkModeStore } from '../../lib/app/useDarkMode';
import { useToasts } from '../../lib/ui/toast';
import { FONT } from '../../lib/ui/tokens';

export function ToastHost() {
  const items = useToasts();
  const darkMode = useDarkModeStore((s) => s.darkMode);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        // Sit above the right-rail footer's collapse axis but below any
        // modal scrim. 24 px from the bottom keeps it clear of the
        // NowPlayingBar without floating awkwardly mid-screen.
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
        zIndex: 1200,
      }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          style={{
            pointerEvents: 'auto',
            fontFamily: FONT.ui,
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: darkMode ? '#f5f5f7' : '#0e0e1a',
            background: darkMode ? 'rgba(28,28,32,0.92)' : 'rgba(255,255,255,0.96)',
            border: `1px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
            borderRadius: 12,
            padding: '10px 16px',
            boxShadow: darkMode
              ? '0 8px 28px rgba(0,0,0,0.45)'
              : '0 8px 28px rgba(0,0,0,0.12)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            animation: 'vbk-toast-in 180ms cubic-bezier(0.2, 0.9, 0.3, 1)',
            maxWidth: 360,
            textAlign: 'center',
          }}
        >
          {t.message}
        </div>
      ))}
      <style>{`
        @keyframes vbk-toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
