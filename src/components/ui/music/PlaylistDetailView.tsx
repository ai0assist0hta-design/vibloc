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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Shuffle, ChevronLeft } from 'lucide-react';
import { useTaggerPlaylist, usePlaylist } from '../../../lib/music/buildingPlaylist';
import { useT } from '../../../lib/app/i18n';
import type { RecommendedTrack } from '../../../lib/music/trackTypes';
import { FONT, ROW_CAPTION, SECTION_HEADER, SPACE } from '../../../lib/ui/tokens';
import { PlaylistCover } from './PlaylistCover';
import { playPreview } from './PreviewPlayer';
import { TrackRow } from './TrackRow';

const NAME_MAX_LEN = 30;

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
  const t = useT();
  const { group, tracks, name, setName, setCover, isMine } = useTaggerPlaylist(buildingId, taggerId);
  const playlist = usePlaylist(buildingId);
  const [draft, setDraft] = useState(name);
  useEffect(() => { setDraft(name); }, [name, taggerId]);

  /* ── Cover upload (mine-only) ──
   *  Mirrors the MyPage avatar pattern: hover surfaces a camera glyph
   *  over a 45 % scrim, click opens a hidden <input type="file">,
   *  uploads land as data URLs in `taggerPlaylistCovers[taggerId]`
   *  via setCover(). 2 MB cap to keep localStorage bounded. */
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverHover, setCoverHover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const handleCoverPick = () => coverInputRef.current?.click();
  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setCoverError(t('detail.coverTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      if (!url) return;
      setCover(url);
      setCoverError(null);
    };
    reader.readAsDataURL(f);
  };
  const handleCoverRemove = () => setCover('');

  // Cover sources that the shared PlaylistCover component picks
  // between (custom override → 2×2 mosaic → single image → monogram).
  // useMemo keeps the array stable so PlaylistCover doesn't think
  // the artwork list changed every render.
  const coverGrid = useMemo(
    () => (group?.coverGridUrls && group.coverGridUrls.length > 0
      ? group.coverGridUrls
      : tracks.map((t) => t.artworkUrl).filter(Boolean) as string[]),
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
      genre: first.genre,
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
      genre: pick.genre,
    });
  }

  if (!group) {
    return (
      <div style={{
        // Empty-state typography matches ROW_CAPTION so it reads in
        // the same voice as the rail's other muted helper text.
        ...ROW_CAPTION,
        padding: `${SPACE[6]}px ${SPACE[4]}px`,
        color: text2,
        textAlign: 'center',
      }}>
        Playlist no longer exists.
        <div style={{ marginTop: SPACE[3] }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              ...backBtnStyle(text, divider),
              display: 'inline-flex', alignItems: 'center', gap: SPACE[1],
            }}
          >
            <ChevronLeft size={12} strokeWidth={2.4} />
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      // FONT.ui — same body type as every other rail surface.
      // Vertical rhythm: SPACE[3] (12) between top-level blocks
      // (back row → hero → action pills → header → track list).
      // Anything off-grid (10 / 14 / 18) is intentionally avoided
      // so the detail view shares the rail's 4-pt spacing scale.
      display: 'flex', flexDirection: 'column', gap: SPACE[3],
      fontFamily: FONT.ui,
      letterSpacing: '-0.01em',
    }}>
      {/* Slim header — icon-only back chevron + heart meta.
          Back button mirrors the FixedQueueSidebar collapse chevron
          (28×28 ghost, hover bg, 14 px lucide glyph) so the rail's
          two chevrons look like the same control with opposite
          direction.
          paddingLeft 12 — the entire detail content column (back,
          hero, actions, header) is indented 12 px so its left edge
          lands at rail-x=24, matching the track-row artwork column.
          Without this, hero cover sat at rail-x=12 while tracks
          started at rail-x=24, breaking the panel's vertical axis. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: SPACE[2],
        // paddingLeft 12 indents the chevron column to rail-x=24
        // (matching every other indented row in the detail view).
        // paddingRight 6 lands the heart-meta's right edge on the
        // SAME trailing axis as the FixedQueueSidebar header's
        // collapse chevron (panel-right − 18) and as every track
        // row's +/✕ cluster — one continuous right rail.
        paddingLeft: SPACE[3],
        paddingRight: 12,
      }}>
        <button
          type="button"
          onClick={onBack}
          aria-label={t('detail.back')}
          title={t('detail.back')}
          style={{
            width: 28, height: 28, borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: text2,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 120ms ease, color 120ms ease',
            flexShrink: 0,
            // marginLeft -8 pulls the 32-wide button so the 16-px
            // chevron's LEFT edge lands at panel-x=24 — exactly where
            // the SONG section header's text starts. The chevron and
            // the eyebrow share one vertical axis below them.
            marginLeft: -8,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(14,14,26,0.07)';
            e.currentTarget.style.color = text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = text2;
          }}
        >
          <ChevronLeft size={16} strokeWidth={2.4} />
        </button>
        {/* Heart meta — sans 11/700 to match the rail's other
            count badges (TopTagger heart count, RecommendedList /
            TOP PICKS counters). Hidden at zero likes. */}
        {group.totalLikes > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: SPACE[1],
            color: '#ff375f',
            fontSize: 12, fontWeight: 700,
            fontFamily: FONT.ui,
            letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
              <path
                d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3 5 6.5 5c1.9 0 3.7 1 5 2.7C12.8 6 14.6 5 16.5 5 20 5 21.8 8.6 20.5 11.8 18.5 16.4 12 21 12 21z"
                fill="#ff375f"
                stroke="#ff375f"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            {group.totalLikes}
          </span>
        )}
      </div>

      {/* Hero — Apple Music style. Square cover left, headline +
          curator + counts right. Gap 12 to match the rail's
          canonical gap token (every TopicRow / row uses 12). Was 14
          (one-off magic number).
          paddingLeft 12 keeps the cover's left edge on the same
          vertical axis (rail-x=24) as the track artwork below it. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: SPACE[3],
        paddingLeft: SPACE[3],
      }}>
        {/* Cover slot — wraps the shared PlaylistCover with a hover
            scrim + camera affordance for the curator. Read-only viewers
            see the bare cover (no overlay, no cursor change). The
            wrapper preserves the 120 × 120 footprint so the right-side
            text column doesn't reflow when the overlay attaches. */}
        <div
          style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}
          onMouseEnter={isMine ? () => setCoverHover(true) : undefined}
          onMouseLeave={isMine ? () => setCoverHover(false) : undefined}
        >
          <PlaylistCover
            customUrl={group?.customCoverUrl}
            artworkUrls={coverGrid}
            fallbackText={headline}
            size={120}
            radius={8}
            divider={divider}
            text2={text2}
          />
          {isMine ? (
            <>
              <button
                type="button"
                onClick={handleCoverPick}
                onFocus={() => setCoverHover(true)}
                onBlur={() => setCoverHover(false)}
                aria-label={t('detail.changeCover')}
                title={t('detail.changeCover')}
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  background: 'rgba(0,0,0,0.45)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  opacity: coverHover ? 1 : 0,
                  transition: 'opacity 160ms ease',
                  padding: 0,
                  fontFamily: FONT.ui,
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleCoverChange}
                style={{ display: 'none' }}
              />
            </>
          ) : null}
        </div>
        <div style={{
          minWidth: 0, flex: 1,
          display: 'flex', flexDirection: 'column',
          // Internal gap SPACE[1] (4) — same micro-rhythm used by
          // every Apple-Music-style row's title↔caption pair (see
          // PopularRow gap 1, TrackRow gap 1, RankRow gap 2).
          gap: SPACE[1],
        }}>
          {isMine ? (
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, NAME_MAX_LEN))}
              onBlur={() => { if (draft !== name) setName(draft); }}
              placeholder={t('detail.namePlaceholder')}
              aria-label={t('detail.playlistName')}
              maxLength={NAME_MAX_LEN}
              style={{
                // Headline 17 / 700 / -0.01em — Apple Music macOS
                // playlist title spec. Was 18 / 800 / -0.2 letterSpacing,
                // 100 g heavier than every other heading on the rail.
                width: '100%', boxSizing: 'border-box',
                background: 'transparent',
                border: 'none',
                padding: 0,
                fontSize: 16, fontWeight: 600, color: text,
                letterSpacing: '-0.01em', lineHeight: 1.2,
                fontFamily: FONT.ui,
                outline: 'none',
              }}
              // Placeholder color — match text3 (caption tone) so
              // "Playlist name" reads as instructional, not as a
              // failed render. The default UA placeholder is too
              // pale and flickered against the dark cover artwork.
              className="vbk-detail-name-input"
            />
          ) : (
            <div
              style={{
                fontSize: 16, fontWeight: 600, color: text,
                letterSpacing: '-0.01em', lineHeight: 1.2,
                fontFamily: FONT.ui,
                wordBreak: 'break-word',
              }}
              title={headline}
            >
              {headline}
            </div>
          )}
          {/* Curator handle — alias only, no avatar (the hero cover
              already carries the curator's visual identity). Placed
              between the headline and the track-count line so the
              meta column reads "title → @id → 5 songs", same rhythm
              as Apple Music macOS playlist details. Hidden on
              `isMine` (don't show the user their own handle on
              their own playlist). */}
          {!isMine && group.alias ? (
            <div
              style={{
                ...ROW_CAPTION,
                color: text3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                marginTop: 4,
              }}
              title={`@${group.alias}`}
            >
              @{group.alias}
            </div>
          ) : null}
          {/* Track count subtitle — ROW_CAPTION typography (12 / 500
              / -0.01em / lh 1.3) at 400 weight so it reads as quiet
              metadata. Same rhythm + tracking as every other row's
              caption line; only the weight is dialed back. */}
          <div style={{
            ...ROW_CAPTION,
            fontWeight: 400,
            color: text3,
            marginTop: SPACE[1],
          }}>
            {(tracks.length === 1
              ? t('detail.songCount_one')
              : t('detail.songCount')
            ).replace('{n}', String(tracks.length))}
          </div>
          {/* Cover utility row — only the curator sees it; only when
              there's something to surface (uploaded cover OR a fresh
              upload error). Underline-text link tone matches MyPage's
              "Remove photo" affordance. */}
          {isMine && (group?.customCoverUrl || coverError) ? (
            <div style={{
              marginTop: SPACE[1],
              display: 'flex', alignItems: 'center', gap: SPACE[2], flexWrap: 'wrap',
            }}>
              {group?.customCoverUrl ? (
                <button
                  type="button"
                  onClick={handleCoverRemove}
                  style={{
                    ...ROW_CAPTION,
                    fontWeight: 400,
                    color: text3,
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                    fontFamily: FONT.ui,
                  }}
                >
                  {t('detail.removeCover')}
                </button>
              ) : null}
              {coverError ? (
                <span style={{ ...ROW_CAPTION, color: '#a8261b' }}>{coverError}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Action buttons — Apple Music style pills. Play (filled red)
          and Shuffle (outline). Drive the existing 30 s preview
          player; no Apple-account dependency.
          paddingLeft 12 — same hero-column indent so Play's left
          edge sits at rail-x=24, matching the cover and tracks. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: SPACE[2],
        paddingLeft: SPACE[3],
      }}>
        <button
          type="button"
          onClick={handlePlayAll}
          disabled={!tracks.some((t) => t.previewUrl)}
          aria-label={t('player.play')}
          style={pillBtnStyle({ filled: true, divider, text, text2 })}
        >
          <Play size={12} fill="currentColor" strokeWidth={0} />
          {t('player.play')}
        </button>
        <button
          type="button"
          onClick={handleShuffle}
          disabled={!tracks.some((t) => t.previewUrl)}
          aria-label={t('player.shuffle')}
          style={pillBtnStyle({ filled: false, divider, text, text2 })}
        >
          <Shuffle size={12} strokeWidth={2.4} />
          {t('player.shuffle')}
        </button>
        {/* Character counter ("0/30") removed — `maxLength` on the
            input + the natural slice in onChange already enforce
            the limit, so a visible counter was redundant chrome. */}
      </div>

      {/* Track list header — "Song" left, action-column label right.
          Right span is sized + center-aligned to sit OVER the row's
          two-button action cluster (28 + 2 + 28 = 58 px). Removes
          the previous misalignment where the label hovered to the
          right of the icons. Apple SF small caps (11 / 600 / 0.06em)
          replaces the heavier mono 9 / 800 / 1.2 px so it matches
          every other eyebrow on the rail. */}
      <div style={{
        // Spacing on the 4-pt grid:
        //   marginTop SPACE[1] (4) lifts the divider clear of the
        //   action pills.
        //   paddingTop SPACE[2] (8) gives the SONG label breathing
        //   room above the first row.
        //   paddingLeft SPACE[3] indents the header into the same
        //   rail-x=24 column the artwork uses.
        //   paddingRight 6 keeps the EDIT label centered over the
        //   row's trailing 28+2+28 cluster.
        marginTop: SPACE[1],
        paddingTop: SPACE[2],
        borderTop: `1px solid ${divider}`,
        paddingLeft: SPACE[3],
        paddingRight: 12,
        display: 'flex', alignItems: 'center',
        ...SECTION_HEADER,
        color: text3,
      }}>
        <span style={{ flex: 1 }}>{t('detail.song')}</span>
        {/* Trailing OPEN / EDIT label removed — the row's ⋯ + ✕/+
            cluster is already self-explanatory (Apple Music macOS
            doesn't label the trailing actions either). The header
            now reads as a single SONG eyebrow. */}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[1] }}>
        {tracks.length === 0 ? (
          <div style={{
            ...ROW_CAPTION,
            color: text2, padding: `${SPACE[3]}px 0`,
            textAlign: 'center',
          }}>
            {t('detail.noTracks')}
          </div>
        ) : (
          tracks.map((tr) => {
            // Mine: ✕ remove. Other people's playlist: + to copy
            // into MY playlist for this building, or ✓ (disabled)
            // when I've already added it. Per-user duplicate guard
            // lives in the store — same track can sit in multiple
            // users' lists independently.
            const iHavePinned = playlist.isPinned(tr.id);
            const action = isMine
              ? 'remove' as const
              : iHavePinned ? 'pinned' as const : 'add' as const;
            return (
              <TrackRow
                key={tr.id}
                track={tr}
                text={text}
                text2={text2}
                divider={divider}
                rightAction={action}
                onRightAction={() => {
                  if (isMine) {
                    playlist.unpin(tr.id);
                  } else if (!iHavePinned) {
                    playlist.pin(tr);
                  }
                }}
                // Apple Music deep link — flows into the row's MoreMenu
                // (Track info / Share). Always provided so info+share
                // work on both your own and others' playlists.
                appleMusicHref={appleMusicHrefFor(tr)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function backBtnStyle(text: string, divider: string): React.CSSProperties {
  // Empty-state fallback button — kept as a labeled pill (vs. the
  // icon-only chevron in the loaded view) since users hitting "no
  // playlist" need a clearer action than a stray glyph. Typography
  // unified to FONT.ui 12/600/-0.01em.
  return {
    fontFamily: FONT.ui,
    fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em',
    padding: '8px 12px', borderRadius: 8,
    border: `1px solid ${divider}`,
    background: 'transparent',
    color: text, cursor: 'pointer',
    transition: 'background 150ms ease',
  };
}

/** Action pill — neutral ink across both Play and Shuffle so the
 *  detail view shares the rail's monochrome system (no APPLE_RED
 *  brand fill, which made Play visually shout next to every other
 *  borderless / outline control on the right rail).
 *
 *  • `filled` (Play)    → ink fill, paper text — high-emphasis but
 *                         neutral, like a SF Symbols action button.
 *  • `outlined` (Shuf.) → transparent + 1 px hairline + ink text —
 *                         secondary affordance, matches the section
 *                         eyebrows / search input border tone.
 *
 *  Typography is FONT.ui 13/600/-0.01em — exactly the TopicRow /
 *  AddTrackComposer label spec, so the pills feel native to the
 *  rail rather than imported from a brand surface. */
function pillBtnStyle({
  filled, divider, text, text2,
}: { filled: boolean; divider: string; text: string; text2: string }): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '8px 16px', borderRadius: 999,
    border: filled ? 'none' : `1px solid ${divider}`,
    background: filled ? text : 'transparent',
    color: filled ? '#fff' : text,
    fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em',
    fontFamily: FONT.ui,
    cursor: 'pointer',
    transition: 'transform 120ms ease, opacity 120ms ease, background 120ms ease',
  };
  // Disabled state inherits from `disabled` attribute — UA dims it.
  void text2;
}

// CoverArt was the previous in-file 1×1 fallback. Replaced by the
// shared PlaylistCover (mosaic + custom override). Kept removed
// rather than dead-coded so future readers don't think there are
// two cover renderers to choose between.
