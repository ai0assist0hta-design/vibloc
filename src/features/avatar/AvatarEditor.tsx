/**
 * AvatarEditor — layered PNG profile customizer (Memoji-style).
 *
 * Per-part picker (얼굴/헤어/안경/모자/귀고리/수염/콧수염) using PNG
 * layers baked from the HEADZ Blender source. Live preview composites
 * the layers in real time. NO <Canvas>, NO GLB load.
 *
 * Layout:
 *   ┌───────────────────────────────────────────┐
 *   │ ✕  프로필 편집                  [저장]    │
 *   ├───────────────────────────────────────────┤
 *   │            ╭──────────╮                   │
 *   │            │ layered  │                   │
 *   │            │ preview  │                   │
 *   │            ╰──────────╯                   │
 *   │  기본 캐릭터  ◯◯◯◯◯◯                      │
 *   │  헤어        🦱 ✕ 1 2 3 ...                │
 *   │  안경        🕶 ✕ 1 2 3                    │
 *   │  모자        🎩 ON / OFF                  │
 *   │  귀고리      💎 ON / OFF                  │
 *   │  수염        🧔 ✕ 1 2 3   (남 only)        │
 *   │  콧수염      👨 ✕ 1 2 3   (남 only)        │
 *   └───────────────────────────────────────────┘
 */

import { useEffect, useState } from 'react';
import {
  AVATAR_BASES,
  LAYER_AVAILABILITY,
  rollAvatarForId,
  type AvatarBase,
  type VibAvatarConfig,
} from './avatarConfig';
import { LayeredAvatar } from './LayeredAvatar';
import { saveAvatar, useUserAvatar } from './useUserAvatar';

type Props = {
  userId: string;
  userName?: string;
  open: boolean;
  onClose: () => void;
};

const sans =
  "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const C = {
  ink: '#1a1a2e',
  text2: '#48484a',
  text3: '#6e6e73',
  border: 'rgba(26,26,46,0.08)',
  surface: 'rgba(26,26,46,0.04)',
  bg: '#f8f7f4',
  cta: '#1a1a2e',
  ctaText: '#faf9f6',
  cardBg: 'rgba(255,255,255,0.95)',
};

const BASE_LABELS: Record<AvatarBase, string> = {
  'f-white': '여 / 화이트',
  'f-brown': '여 / 브라운',
  'f-black': '여 / 블랙',
  'm-white': '남 / 화이트',
  'm-brown': '남 / 브라운',
  'm-black': '남 / 블랙',
};

export function AvatarEditor({ userId, userName, open, onClose }: Props) {
  const saved = useUserAvatar(userId);
  const [draft, setDraft] = useState<VibAvatarConfig>(
    () => saved ?? rollAvatarForId(userId),
  );

  useEffect(() => {
    if (!open) return;
    setDraft(saved ?? rollAvatarForId(userId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const avail = LAYER_AVAILABILITY[draft.base];

  // When switching base, drop variants the new base doesn't ship.
  function switchBase(b: AvatarBase) {
    setDraft((d) => {
      const a = LAYER_AVAILABILITY[b];
      return {
        ...d,
        base: b,
        hair: d.hair && a.hair.includes(d.hair) ? d.hair : (a.hair[0] ?? null),
        glasses: d.glasses && a.glasses.includes(d.glasses) ? d.glasses : null,
        earrings: a.earrings ? d.earrings : false,
        beard: d.beard && a.beard.includes(d.beard) ? d.beard : null,
        mustache: d.mustache && a.mustache.includes(d.mustache) ? d.mustache : null,
      };
    });
  }

  function handleSave() { saveAvatar(userId, draft); onClose(); }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="프로필 편집"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,15,20,0.55)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: sans,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 'min(640px, 100%)', maxHeight: '92vh',
        background: C.bg, borderRadius: 20,
        boxShadow: '0 32px 80px rgba(0,0,0,0.30)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '14px 20px',
          borderBottom: `1px solid ${C.border}`,
          background: C.cardBg,
        }}>
          <button type="button" onClick={onClose} aria-label="닫기"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              border: 'none', background: 'transparent',
              fontSize: 18, color: C.ink, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          <div style={{
            flex: 1, marginLeft: 8,
            fontSize: 16, fontWeight: 700,
            letterSpacing: '-0.01em', color: C.ink,
          }}>프로필 편집{userName ? ` · ${userName}` : ''}</div>
          <button type="button" onClick={handleSave}
            style={{
              padding: '9px 22px', borderRadius: 999,
              fontSize: 14, fontWeight: 700,
              background: C.cta, color: C.ctaText,
              border: 'none', cursor: 'pointer',
              letterSpacing: '-0.01em',
            }}>저장</button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '24px 22px 28px',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          {/* Live preview */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
            <div style={{
              width: 200, height: 200, borderRadius: '50%',
              overflow: 'hidden',
              border: `1px solid ${C.border}`,
              background: '#f3f1ec',
            }}>
              <LayeredAvatar config={draft} size={200} />
            </div>
          </div>

          {/* Character */}
          <Section title="기본 캐릭터">
            <Grid cols={3}>
              {AVATAR_BASES.map((b) => (
                <ThumbTile
                  key={b}
                  preview={
                    <LayeredAvatar
                      config={{ ...draft, base: b,
                        hair: LAYER_AVAILABILITY[b].hair[0] ?? null }}
                      size={72}
                    />
                  }
                  label={BASE_LABELS[b]}
                  selected={b === draft.base}
                  onClick={() => switchBase(b)}
                />
              ))}
            </Grid>
          </Section>

          {/* Hair */}
          <Section title="헤어스타일">
            <Grid cols={6}>
              <NoneTile selected={!draft.hair}
                onClick={() => setDraft((d) => ({ ...d, hair: null }))} />
              {avail.hair.map((n) => (
                <ThumbTile
                  key={n}
                  preview={<LayeredAvatar
                    config={{ ...draft, hair: n, glasses: null, hat: false, earrings: false, beard: null, mustache: null }}
                    size={56} />}
                  label={`#${n}`}
                  selected={draft.hair === n}
                  smaller
                  onClick={() => setDraft((d) => ({ ...d, hair: n }))}
                />
              ))}
            </Grid>
          </Section>

          {/* Glasses */}
          {avail.glasses.length > 0 && (
            <Section title="안경">
              <Grid cols={4}>
                <NoneTile selected={!draft.glasses}
                  onClick={() => setDraft((d) => ({ ...d, glasses: null }))} />
                {avail.glasses.map((n) => (
                  <ThumbTile key={n}
                    preview={<LayeredAvatar
                      config={{ ...draft, glasses: n, hat: false, earrings: false }}
                      size={56} />}
                    label={`#${n}`}
                    selected={draft.glasses === n}
                    smaller
                    onClick={() => setDraft((d) => ({ ...d, glasses: n }))}
                  />
                ))}
              </Grid>
            </Section>
          )}

          {/* Hat */}
          {avail.hat && (
            <Section title="모자">
              <Grid cols={2}>
                <NoneTile selected={!draft.hat}
                  onClick={() => setDraft((d) => ({ ...d, hat: false }))} />
                <ThumbTile
                  preview={<LayeredAvatar
                    config={{ ...draft, hat: true }} size={56} />}
                  label="모자"
                  selected={!!draft.hat}
                  smaller
                  onClick={() => setDraft((d) => ({ ...d, hat: true }))}
                />
              </Grid>
            </Section>
          )}

          {/* Earrings */}
          {avail.earrings && (
            <Section title="귀고리">
              <Grid cols={2}>
                <NoneTile selected={!draft.earrings}
                  onClick={() => setDraft((d) => ({ ...d, earrings: false }))} />
                <ThumbTile
                  preview={<LayeredAvatar
                    config={{ ...draft, earrings: true }} size={56} />}
                  label="귀고리"
                  selected={!!draft.earrings}
                  smaller
                  onClick={() => setDraft((d) => ({ ...d, earrings: true }))}
                />
              </Grid>
            </Section>
          )}

          {/* Beard (male) */}
          {avail.beard.length > 0 && (
            <Section title="수염">
              <Grid cols={4}>
                <NoneTile selected={!draft.beard}
                  onClick={() => setDraft((d) => ({ ...d, beard: null }))} />
                {avail.beard.map((n) => (
                  <ThumbTile key={n}
                    preview={<LayeredAvatar
                      config={{ ...draft, beard: n, mustache: null, hat: false, earrings: false }}
                      size={56} />}
                    label={`#${n}`}
                    selected={draft.beard === n}
                    smaller
                    onClick={() => setDraft((d) => ({ ...d, beard: n }))}
                  />
                ))}
              </Grid>
            </Section>
          )}

          {/* Mustache (male) */}
          {avail.mustache.length > 0 && (
            <Section title="콧수염">
              <Grid cols={4}>
                <NoneTile selected={!draft.mustache}
                  onClick={() => setDraft((d) => ({ ...d, mustache: null }))} />
                {avail.mustache.map((n) => (
                  <ThumbTile key={n}
                    preview={<LayeredAvatar
                      config={{ ...draft, mustache: n, beard: null, hat: false, earrings: false }}
                      size={56} />}
                    label={`#${n}`}
                    selected={draft.mustache === n}
                    smaller
                    onClick={() => setDraft((d) => ({ ...d, mustache: n }))}
                  />
                ))}
              </Grid>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 11, fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: C.text3,
        marginBottom: 10,
      }}>{title}</div>
      {children}
    </div>
  );
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 10,
    }}>{children}</div>
  );
}

function ThumbTile({
  preview, label, selected, onClick, smaller,
}: {
  preview: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
  smaller?: boolean;
}) {
  const imgSize = smaller ? 56 : 72;
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      style={{
        padding: smaller ? '8px 4px' : '10px 6px',
        borderRadius: 12,
        border: `1.5px solid ${selected ? C.ink : C.border}`,
        background: selected ? C.surface : C.cardBg,
        color: C.ink,
        fontSize: smaller ? 11 : 12, fontWeight: 600,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 6, lineHeight: 1.2,
      }}>
      <span style={{
        width: imgSize, height: imgSize,
        borderRadius: '50%',
        overflow: 'hidden',
        background: '#f3f1ec',
        display: 'inline-block',
      }}>{preview}</span>
      {label}
    </button>
  );
}

function NoneTile({ selected, onClick }: { selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      style={{
        padding: '8px 4px',
        borderRadius: 12,
        border: `1.5px solid ${selected ? C.ink : C.border}`,
        background: selected ? C.surface : C.cardBg,
        color: C.ink,
        fontSize: 11, fontWeight: 600,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 6, lineHeight: 1.2,
      }}>
      <span style={{
        width: 56, height: 56,
        borderRadius: '50%',
        background: '#f3f1ec',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, color: C.text3,
      }}>✕</span>
      없음
    </button>
  );
}

export type { PoseId, AvatarBase, VibAvatarConfig } from './avatarConfig';
