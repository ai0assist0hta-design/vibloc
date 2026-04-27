/**
 * PlaylistDetailView — replaces the right-panel body when a top
 * playlist row is clicked. Shows the curator's profile, an editable
 * playlist NAME (curator-only), and the list of tracks they tagged
 * in this building.
 *
 * Read-only for other people's playlists; if `isMine` the name is
 * editable inline.
 *
 * Note: the free-form curator "comment" feature (taggerNotes) and
 * the per-building description "글 태그" feature were removed
 * 2026-04-27. The custom playlist NAME is the only editable string
 * left on a playlist.
 */

import { useEffect, useState } from 'react';
import { useTaggerPlaylist, usePlaylist } from '../../../lib/music/buildingPlaylist';
import { resolveAvatarUrl } from '../../../features/auth/avatar';
import { TrackRow } from './TrackRow';

const NAME_MAX_LEN = 60;

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
  const { group, tracks, name, setName, isMine } = useTaggerPlaylist(buildingId, taggerId);
  const playlist = usePlaylist(buildingId);
  const [draft, setDraft] = useState(name);
  useEffect(() => { setDraft(name); }, [name, taggerId]);

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
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: group.totalLikes > 0 ? '#ff375f' : text3,
            fontSize: 11, fontWeight: 700,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
              <path
                d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3 5 6.5 5c1.9 0 3.7 1 5 2.7C12.8 6 14.6 5 16.5 5 20 5 21.8 8.6 20.5 11.8 18.5 16.4 12 21 12 21z"
                fill={group.totalLikes > 0 ? '#ff375f' : 'none'}
                stroke={group.totalLikes > 0 ? '#ff375f' : 'currentColor'}
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
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

      {/* Playlist NAME — only editable string on a playlist. */}
      {isMine ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{
            fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
            textTransform: 'uppercase', color: text3,
          }}>
            플레이리스트 이름
          </label>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, NAME_MAX_LEN))}
            onBlur={() => { if (draft !== name) setName(draft); }}
            placeholder="이름을 적어주세요… (예: '시부야 오후 산책')"
            aria-label="Playlist name"
            maxLength={NAME_MAX_LEN}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'transparent',
              border: `1px solid ${divider}`,
              borderRadius: 10, padding: '10px 12px',
              fontSize: 13, fontWeight: 600, color: text,
              fontFamily: "'IBM Plex Mono', monospace",
              outline: 'none',
            }}
          />
          <div style={{
            fontSize: 9, color: text3, textAlign: 'right', letterSpacing: 0.4,
          }}>
            {draft.length}/{NAME_MAX_LEN}
          </div>
        </div>
      ) : name ? (
        <div style={{
          padding: '10px 12px',
          borderRadius: 10,
          border: `1px solid ${divider}`,
          background: 'rgba(0,0,0,0.02)',
          fontSize: 13, fontWeight: 700, color: text,
          letterSpacing: 0.2,
        }}>
          {name}
        </div>
      ) : null}

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
