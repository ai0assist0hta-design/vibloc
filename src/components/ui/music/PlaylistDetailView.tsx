/**
 * PlaylistDetailView — replaces the right-panel body when a top
 * playlist row is clicked. Shows the curator's profile, their note,
 * and the list of tracks they tagged in this building.
 *
 * Read-only for other people's playlists; if `isMine` the note is
 * editable inline.
 *
 * Layout
 *   ┌────────────────────────────────────────┐
 *   │  ← back            ❤ 12 · 7 tracks     │
 *   │  ◯  VIBLOC Admin                        │
 *   │     @midnight.tape                       │
 *   │  ─────────────────────────────────────── │
 *   │  "late-night Itaewon walk soundtrack"   │
 *   │  ─────────────────────────────────────── │
 *   │  [TrackRow] [TrackRow] [TrackRow] …     │
 *   └────────────────────────────────────────┘
 */

import { useEffect, useState } from 'react';
import { useTaggerPlaylist, usePlaylist } from '../../../lib/music/buildingPlaylist';
import { resolveAvatarUrl } from '../../../features/auth/avatar';
import { TrackRow } from './TrackRow';

const NOTE_MAX_LEN = 240;

type Props = {
  buildingId: string;
  taggerId: string;
  text: string;
  text2: string;
  text3: string;
  divider: string;
  onBack: () => void;
};

export function PlaylistDetailView({
  buildingId, taggerId, text, text2, text3, divider, onBack,
}: Props) {
  const { group, tracks, note, setNote, isMine } = useTaggerPlaylist(buildingId, taggerId);
  const playlist = usePlaylist(buildingId);
  const [draft, setDraft] = useState(note);
  useEffect(() => { setDraft(note); }, [note, taggerId]);

  if (!group) {
    return (
      <div style={{
        padding: '24px 16px',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11, color: text2,
        textAlign: 'center',
      }}>
        Playlist no longer exists.
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={onBack} style={backBtnStyle(text, divider)}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      {/* Top bar — back + counts */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to building panel"
          style={backBtnStyle(text, divider)}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          ← BACK
        </button>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 10, fontWeight: 700, color: text2, letterSpacing: 0.3,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '3px 9px', borderRadius: 999,
            border: `1px solid ${group.totalLikes > 0 ? '#ff375f44' : divider}`,
            background: group.totalLikes > 0 ? '#ff375f14' : 'transparent',
            color: group.totalLikes > 0 ? '#ff375f' : text3,
          }}>
            <span style={{ fontSize: 11 }}>{group.totalLikes > 0 ? '❤️' : '🤍'}</span>
            {group.totalLikes}
          </span>
          <span style={{ color: text3 }}>· {group.trackCount}t</span>
        </div>
      </div>

      {/* Profile header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img
          src={resolveAvatarUrl(group.taggerAvatarUrl)}
          alt={group.taggerName}
          width={48}
          height={48}
          style={{
            width: 48, height: 48, borderRadius: '50%',
            objectFit: 'cover',
            border: `2px solid ${divider}`,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
            flexShrink: 0, background: divider,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: text, letterSpacing: 0.1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }} title={group.taggerName}>
            {group.taggerName}
          </div>
          <div style={{
            fontSize: 10, fontWeight: 600, color: text2, letterSpacing: 0.3, marginTop: 2,
          }}>
            <span style={{ color: text3 }}>@</span>{group.alias}
          </div>
        </div>
      </div>

      {/* Curator's comment */}
      {isMine ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX_LEN))}
            onBlur={() => { if (draft !== note) setNote(draft); }}
            placeholder="Leave a note for visitors… (e.g. 'late-night Itaewon walk')"
            aria-label="Playlist note"
            maxLength={NOTE_MAX_LEN}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'transparent',
              border: `1px solid ${divider}`,
              borderRadius: 10, padding: '10px 12px',
              fontSize: 11.5, lineHeight: 1.5, color: text,
              fontFamily: "'IBM Plex Mono', monospace",
              resize: 'none', outline: 'none',
            }}
          />
          <div style={{
            fontSize: 9, color: text3, textAlign: 'right', letterSpacing: 0.4,
          }}>
            {draft.length}/{NOTE_MAX_LEN}
          </div>
        </div>
      ) : note ? (
        <div style={{
          padding: '10px 12px',
          borderRadius: 10,
          border: `1px solid ${divider}`,
          background: 'rgba(0,0,0,0.02)',
          fontSize: 11.5, lineHeight: 1.5, color: text,
          fontStyle: 'italic',
          whiteSpace: 'pre-wrap',
        }}>
          “{note}”
        </div>
      ) : (
        <div style={{
          fontSize: 10, color: text3, fontStyle: 'italic',
          padding: '4px 0',
        }}>
          (no note from the curator)
        </div>
      )}

      {/* Track list */}
      <div style={{
        marginTop: 4, paddingTop: 10,
        borderTop: `1px solid ${divider}`,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
          textTransform: 'uppercase', color: text3,
        }}>
          TRACKS ({tracks.length})
        </div>
        {tracks.length === 0 ? (
          <div style={{
            fontSize: 10.5, color: text2, padding: '12px 0',
            textAlign: 'center',
          }}>
            No tracks remain in this playlist.
          </div>
        ) : (
          tracks.map((tr) => (
            <TrackRow
              key={tr.id}
              track={tr}
              text={text}
              text2={text2}
              divider={divider}
              rightAction={isMine ? 'remove' : 'pinned'}
              onRightAction={() => {
                if (isMine) playlist.unpin(tr.id);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function backBtnStyle(text: string, divider: string): React.CSSProperties {
  return {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
    padding: '5px 10px', borderRadius: 8,
    border: `1px solid ${divider}`,
    background: 'transparent',
    color: text, cursor: 'pointer',
    transition: 'background 150ms ease',
  };
}
