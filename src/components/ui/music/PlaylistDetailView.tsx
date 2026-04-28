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

import { useEffect, useMemo, useState } from 'react';
import { Play, Shuffle, ChevronLeft } from 'lucide-react';
import { useTaggerPlaylist, usePlaylist } from '../../../lib/music/buildingPlaylist';
import { resolveAvatarUrl } from '../../../features/auth/avatar';
import type { RecommendedTrack } from '../../../lib/music/trackTypes';
import { APPLE_RED, FONT } from '../../../lib/ui/tokens';
import { playPreview } from './PreviewPlayer';
import { TrackRow } from './TrackRow';

const NAME_MAX_LEN = 60;

/** Best-effort Apple Music deep link for a pinned track. Prefers the
 *  iTunes Search API's `trackViewUrl` (storefront-correct, opens the
 *  exact track page in the Apple Music app on iOS / macOS). Falls
 *  back to a search URL — bulletproof but lands on results. */
function appleMusicHrefFor(t: RecommendedTrack): string | undefined {
  if (t.trackViewUrl) return t.trackViewUrl;
  const term = `${t.artistName} ${t.trackName}`.trim();
  if (!term) return undefined;
  return `https://music.apple.com/search?term=${encodeURIComponent(term)}`;
}

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

  // Cover = top track's artwork, falling back to a gradient monogram.
  // Mirrors the rest of VIBLOC's cover-art pattern.
  const coverUrl = useMemo(
    () => group?.coverArtworkUrl || tracks.find((t) => t.artworkUrl)?.artworkUrl || null,
    [group, tracks],
  );

  const headline = name || group?.taggerName || 'Playlist';

  function handlePlayAll() {
    const first = tracks.find((t) => t.previewUrl);
    if (!first) return;
    playPreview(first.id, first.previewUrl, {
      title: first.trackName,
      artist: first.artistName,
      artworkUrl: first.artworkUrl || undefined,
      appleUrl: first.trackViewUrl || undefined,
    });
  }
  function handleShuffle() {
    const playable = tracks.filter((t) => t.previewUrl);
    if (!playable.length) return;
    const pick = playable[Math.floor(Math.random() * playable.length)];
    playPreview(pick.id, pick.previewUrl, {
      title: pick.trackName,
      artist: pick.artistName,
      artworkUrl: pick.artworkUrl || undefined,
      appleUrl: pick.trackViewUrl || undefined,
    });
  }

  if (!group) {
    return (
      <div style={{
        padding: '24px 16px',
        fontFamily: FONT.mono,
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
      display: 'flex', flexDirection: 'column', gap: 14,
      fontFamily: FONT.mono,
    }}>
      {/* Slim back bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginBottom: -2,
      }}>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to building panel"
          style={{
            ...backBtnStyle(text, divider),
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronLeft size={12} strokeWidth={2.4} />
          BACK
        </button>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: group.totalLikes > 0 ? '#ff375f' : text3,
            fontSize: 11, fontWeight: 700,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
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

      {/* Hero — Apple Music style. Big square cover on the left, big
          headline + curator + counts on the right. Cover dominates the
          panel so the playlist reads as "art object" first. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
      }}>
        <CoverArt url={coverUrl} fallback={headline} divider={divider} text2={text2} />
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {isMine ? (
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, NAME_MAX_LEN))}
              onBlur={() => { if (draft !== name) setName(draft); }}
              placeholder="플레이리스트 이름"
              aria-label="Playlist name"
              maxLength={NAME_MAX_LEN}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'transparent',
                border: 'none',
                padding: 0,
                fontSize: 18, fontWeight: 800, color: text,
                letterSpacing: -0.2, lineHeight: 1.15,
                fontFamily: FONT.ui,
                outline: 'none',
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 18, fontWeight: 800, color: text,
                letterSpacing: -0.2, lineHeight: 1.15,
                fontFamily: FONT.ui,
                wordBreak: 'break-word',
              }}
              title={headline}
            >
              {headline}
            </div>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 2,
          }}>
            <img
              src={resolveAvatarUrl(group.taggerAvatarUrl)}
              alt=""
              width={20}
              height={20}
              style={{
                width: 20, height: 20, borderRadius: 4,
                objectFit: 'cover',
                border: `1px solid ${divider}`,
                flexShrink: 0, background: divider,
              }}
            />
            <span style={{
              fontSize: 11, fontWeight: 700, color: text,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }} title={group.taggerName}>{group.taggerName}</span>
            <span style={{ fontSize: 10.5, color: text3 }}>@{group.alias}</span>
          </div>
          <div style={{
            fontSize: 10, color: text3, letterSpacing: 0.4, marginTop: 2,
          }}>
            {tracks.length} song{tracks.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* Action buttons — Apple Music style pills. Play (filled red)
          and Shuffle (outline). Drive the existing 30 s preview
          player; no Apple-account dependency. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={handlePlayAll}
          disabled={!tracks.some((t) => t.previewUrl)}
          aria-label="Play first track preview"
          style={pillBtnStyle({ filled: true, divider, text, text2 })}
        >
          <Play size={13} fill="currentColor" strokeWidth={0} />
          Play
        </button>
        <button
          type="button"
          onClick={handleShuffle}
          disabled={!tracks.some((t) => t.previewUrl)}
          aria-label="Play a random track preview"
          style={pillBtnStyle({ filled: false, divider, text, text2 })}
        >
          <Shuffle size={13} strokeWidth={2.4} />
          Shuffle
        </button>
        {isMine && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 9, color: text3, letterSpacing: 0.4,
          }}>
            {draft.length}/{NAME_MAX_LEN}
          </span>
        )}
      </div>

      {/* Track list header — "Song" left, optional column right. Mirrors
          the Apple Music desktop layout. */}
      <div style={{
        marginTop: 2, paddingTop: 10,
        borderTop: `1px solid ${divider}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 9, fontWeight: 800, letterSpacing: 1.2,
        textTransform: 'uppercase', color: text3,
      }}>
        <span>Song</span>
        <span>{isMine ? 'Edit' : 'Open'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
              // Replace the ✓ on someone else's playlist with a one-tap
              // jump to Apple Music. The ⋯ Apple deep-link doesn't
              // touch the user's pinned-state, so it stays opt-in only
              // on read-only views (other curators, not your own list).
              appleMusicHref={!isMine ? appleMusicHrefFor(tr) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

function backBtnStyle(text: string, divider: string): React.CSSProperties {
  return {
    fontFamily: FONT.mono,
    fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
    padding: '5px 10px', borderRadius: 8,
    border: `1px solid ${divider}`,
    background: 'transparent',
    color: text, cursor: 'pointer',
    transition: 'background 150ms ease',
  };
}

/** Apple Music style action pill — filled red Play, outline Shuffle. */
function pillBtnStyle({
  filled, divider, text, text2,
}: { filled: boolean; divider: string; text: string; text2: string }): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 999,
    border: filled ? 'none' : `1px solid ${divider}`,
    background: filled ? APPLE_RED : 'transparent',
    color: filled ? '#fff' : text,
    fontSize: 12, fontWeight: 800, letterSpacing: 0.3,
    fontFamily: FONT.mono,
    cursor: 'pointer',
    transition: 'transform 120ms ease, opacity 120ms ease, background 120ms ease',
  };
  // Disabled state inherits from `disabled` attribute — UA dims it.
  void text2;
}

/** Square album cover. The URL comes from the iTunes Search API
 *  (Apple's own CDN) at 1200×1200 — see `lib/music/itunes.ts`. We
 *  pick the most-liked pinned track's artwork as the playlist face;
 *  no separate upload, no manual selection. */
function CoverArt({
  url, fallback, divider, text2,
}: { url: string | null; fallback: string; divider: string; text2: string }) {
  return (
    <div style={{
      position: 'relative',
      width: 132, height: 132,
      flexShrink: 0,
      borderRadius: 12,
      overflow: 'hidden',
      border: `1px solid ${divider}`,
      boxShadow: '0 12px 28px rgba(0,0,0,0.16)',
      background: divider,
    }}>
      {url ? (
        <img
          src={url}
          alt={fallback}
          width={132}
          height={132}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: text2,
          fontFamily: FONT.mono,
          fontSize: 40, fontWeight: 800,
        }}>
          {(fallback.trim().charAt(0) || '?').toUpperCase()}
        </div>
      )}
    </div>
  );
}
