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
import { FONT, SPACE } from '../../../lib/ui/tokens';
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
        fontSize: 12, color: text3,
        fontFamily: FONT.mono,
        textAlign: 'center',
        letterSpacing: 0.4,
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

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={() => playPreview(entry.id, entry.url, entry.meta)}
      aria-label={`Play ${entry.meta.title}`}
      style={{
        display: 'flex', alignItems: 'center', gap: SPACE[3],
        padding: `${SPACE[1]}px ${SPACE[2]}px`,
        borderRadius: 6,
        border: 'none',
        background: isCurrent ? 'rgba(26,26,46,0.06)' : 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        opacity: isPast ? 0.55 : 1,
        transition: 'background 120ms ease, opacity 120ms ease',
        width: '100%',
        fontFamily: FONT.mono,
      }}
      onMouseEnter={(e) => {
        if (!isCurrent) e.currentTarget.style.background = 'rgba(26,26,46,0.04)';
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

      {/* Title + artist — single line each, ellipsized */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: isCurrent ? 700 : 600,
            color: text,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.3,
          }}
          title={entry.meta.title}
        >
          {entry.meta.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: text2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.3,
            marginTop: 2,
          }}
          title={entry.meta.artist}
        >
          {entry.meta.artist}
        </div>
      </div>
    </button>
  );
}
