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

import { Music2, Play } from 'lucide-react';
import { useT } from '../../../lib/app/i18n';
import { FONT } from '../../../lib/ui/tokens';
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
        padding: '24px 8px',
        fontSize: 11, color: text3,
        fontFamily: FONT.mono,
        textAlign: 'center',
        letterSpacing: 0.4,
      }}>
        <Music2 size={24} strokeWidth={1.5} style={{ opacity: 0.4, marginBottom: 8 }} />
        <div>{t('queue.empty')}</div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      {/* Section header — matches PLACE / MUSIC eyebrow style. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 1.2,
          textTransform: 'uppercase', color: text3,
          fontFamily: FONT.mono,
        }}>
          {t('queue.upNext')}
        </div>
        <div style={{
          fontSize: 10, color: text3, opacity: 0.7,
          fontFamily: FONT.mono, letterSpacing: 0.3,
        }}>
          {queue.length}
        </div>
      </div>

      {/* Queue rows */}
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
  return (
    <button
      type="button"
      onClick={() => playPreview(entry.id, entry.url, entry.meta)}
      aria-label={`Play ${entry.meta.title}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 6px',
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
            fontSize: 12,
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
            fontSize: 10.5,
            color: text2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.3,
            marginTop: 1,
          }}
          title={entry.meta.artist}
        >
          {entry.meta.artist}
        </div>
      </div>
    </button>
  );
}
