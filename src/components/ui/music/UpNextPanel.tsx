/**
 * Apple Music-style "Up Next" panel.
 *
 * Modeled after the Continue Playing sidebar in macOS Apple Music
 * (right rail). Shows the current building's queue as a flat list:
 * 44 px artwork + title + artist + hover ⋯ menu. The currently-
 * playing row is highlighted; clicking any other row jumps the
 * player straight to that track.
 *
 * This replaces the old "Featured + TopPlaylists + MyPlaylist"
 * stack on the right floating panel — the queue is the more
 * actionable surface for "what's next" intent.
 */

import { useEffect, useRef } from 'react';
import { Music2, Play } from 'lucide-react';
import { useT } from '../../../lib/app/i18n';
import { useDarkMode } from '../../../lib/app/useDarkMode';
import { FONT, SPACE } from '../../../lib/ui/tokens';
import { MarqueeText } from './MarqueeText';
import { playPreview, usePlayerState, type QueueEntry } from './PreviewPlayer';

type Props = {
  text: string;
  text2: string;
  text3: string;
  divider: string;
};

export function UpNextPanel({ text, text2, text3, divider }: Props) {
  const t = useT();
  const player = usePlayerState();
  const queue = player.queue;
  const currentIdx = queue.findIndex((q) => q.id === player.currentId);

  if (queue.length === 0) {
    return (
      <div style={{
        padding: `${SPACE[6]}px ${SPACE[2]}px`,
        // Apple body caption: 12 px / weight 400 / -0.01em tracking,
        // matching the body density used in FixedToolSidebar +
        // FixedQueueSidebar so the three panels read as one product.
        // Was 12 / 0.4 px which over-tracked at this size.
        fontSize: 12,
        fontWeight: 400,
        letterSpacing: '-0.01em',
        color: text3,
        fontFamily: FONT.ui,
        textAlign: 'center',
      }}>
        <Music2 size={24} strokeWidth={1.5} style={{ opacity: 0.4, marginBottom: SPACE[2] }} />
        <div>{t('queue.empty')}</div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: SPACE[1],
    }}>
      {/* Queue rows — header intentionally omitted per design;
          the rail's outer "Up Next" eyebrow already labels this list. */}
      {queue.map((entry, idx) => (
        <QueueRow
          key={entry.id}
          entry={entry}
          isCurrent={idx === currentIdx}
          isPast={idx < currentIdx}
          text={text}
          text2={text2}
          divider={divider}
        />
      ))}
      {/* Sentinel anchor — kept for parity but unused now; auto-scroll
          targets the active row directly. */}
    </div>
  );
}

function QueueRow({
  entry, isCurrent, isPast, text, text2, divider,
}: {
  entry: QueueEntry;
  isCurrent: boolean;
  isPast: boolean;
  text: string;
  text2: string;
  divider: string;
}) {
  const dark = useDarkMode();
  // When this row becomes the active track (auto-advance OR manual
  // skip), pull it into view inside the scrolling rail. block:'center'
  // lands the row at a stable midpoint so the eye isn't chasing a
  // moving target through the queue.
  const btnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!isCurrent || !btnRef.current) return;
    btnRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  }, [isCurrent]);

  // Unified hover/active token across all hovering panels —
  // matches FixedToolSidebar.rowStyle hover / accent so left rail
  // rows and right rail (UpNextPanel) rows share the exact same
  // interaction tone.
  const activeBg = dark ? 'rgba(255,255,255,0.12)' : 'rgba(14,14,26,0.07)';
  const hoverBg  = dark ? 'rgba(255,255,255,0.08)' : 'rgba(14,14,26,0.05)';

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={() => playPreview(entry.id, entry.url, entry.meta)}
      aria-label={`Play ${entry.meta.title}`}
      aria-current={isCurrent ? 'true' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: SPACE[3],
        padding: `${SPACE[2]}px ${SPACE[2]}px`,
        // 8 px radius — Apple's standard "list item pill" curvature,
        // bumped from 6 so the active row reads as a contained box
        // rather than a near-square highlight.
        borderRadius: 8,
        border: 'none',
        background: isCurrent ? activeBg : 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        opacity: isPast ? 0.55 : 1,
        transition: 'background 160ms ease, opacity 160ms ease',
        width: '100%',
        fontFamily: FONT.ui,
      }}
      onMouseEnter={(e) => {
        if (!isCurrent) e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        if (!isCurrent) e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* Artwork — 38 px to mirror Apple Music's right-rail row */}
      <div style={{
        width: 38, height: 38, borderRadius: 5,
        overflow: 'hidden',
        background: divider,
        flexShrink: 0,
        position: 'relative',
      }}>
        {entry.meta.artworkUrl ? (
          <img
            src={entry.meta.artworkUrl}
            alt=""
            width={38} height={38}
            loading="lazy" decoding="async" referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
        {isCurrent && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Play size={14} fill="currentColor" strokeWidth={0} />
          </span>
        )}
      </div>

      {/* Title + artist — MarqueeText slides on hover when text
          overflows so the user sees the full string without the
          static "…" truncation. Apple Music macOS / Spotify desktop
          row pattern. */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <MarqueeText
          text={entry.meta.title}
          style={{
            fontSize: 12,
            fontWeight: isCurrent ? 600 : 500,
            letterSpacing: '-0.01em',
            color: text,
            lineHeight: 1.3,
          }}
        />
        <MarqueeText
          text={entry.meta.artist}
          style={{
            fontSize: 12,
            fontWeight: 400,
            letterSpacing: '-0.01em',
            color: text2,
            lineHeight: 1.3,
            marginTop: 2,
          }}
        />
      </div>
    </button>
  );
}
