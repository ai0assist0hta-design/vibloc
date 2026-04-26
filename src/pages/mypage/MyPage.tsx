/**
 * MyPage — user profile, playlists, activity.
 *
 * Design system (mirrors LandingPage.tsx / AuthLayout.tsx):
 *   Grid:     8px base — 8 / 16 / 24 / 32 / 48 / 64 / 96
 *   Container: max-width 720px, padding 0 24px
 *   Font:     Inter/Pretendard (sans) + IBM Plex Mono (mono)
 *   Radius:   8 (chip), 12 (button/input), 16 (card)
 *   Card:     padding 24, borderRadius 16, border 1px solid border
 *   Light theme tokens:
 *     ink       #1a1a2e
 *     text2     #48484a
 *     text3     #6e6e73
 *     border    rgba(26,26,46,0.08)
 *     surface   rgba(26,26,46,0.04)
 *     bg        #f8f7f4
 *     cta       #1a1a2e (bg) / #faf9f6 (text)
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { isDevAdmin } from '@/features/auth/devAdmin';
import { useProfileData } from '@/features/profile/useProfileData';
import { PH } from '@/content/placeholders';

/* ── Tokens ── */
const sans =
  "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const mono = "'IBM Plex Mono', ui-monospace, monospace";

const C = {
  ink: '#1a1a2e',
  text2: '#48484a',
  text3: '#6e6e73',
  border: 'rgba(26,26,46,0.08)',
  borderHover: 'rgba(26,26,46,0.16)',
  surface: 'rgba(26,26,46,0.04)',
  cardBg: 'rgba(255,255,255,0.90)',
  cardBorder: 'rgba(255,255,255,0.60)',
  cta: '#1a1a2e',
  ctaText: '#faf9f6',
  danger: '#881337',
  dangerBg: 'rgba(255,228,230,0.90)',
  dangerBorder: 'rgba(251,113,133,0.25)',
} as const;

/* ── Helpers ── */
const TAG_PRESETS = [
  'K-Pop', 'J-Pop', 'Hip-Hop', 'R&B', 'Jazz', 'Lo-fi',
  'Indie', 'Rock', 'EDM', 'Classical', 'Ambient', 'City Pop',
  'Soul', 'Funk', 'Reggae', 'Latin', 'Metal', 'Blues',
] as const;

function timeAgo(epoch: number): string {
  const diff = Date.now() - epoch;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return `${Math.floor(days / 30)}달 전`;
}

function shortBuildingName(id: string): string {
  if (id.startsWith('way/')) return `#${id.slice(4)}`;
  if (id.startsWith('node/')) return `#${id.slice(5)}`;
  if (id.startsWith('relation/')) return `#${id.slice(9)}`;
  if (id.length > 10) return `#${id.slice(-8)}`;
  return `#${id}`;
}

/* ── Shared styles ── */
const sectionBorder: React.CSSProperties = {
  borderTop: `1px solid ${C.border}`,
  paddingTop: 32,
  marginTop: 32,
};

const sectionLabel: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.text3,
  lineHeight: 1,
};

const card: React.CSSProperties = {
  padding: 24,
  borderRadius: 16,
  border: `1px solid ${C.border}`,
  background: C.surface,
};

const chipBase: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.02em',
  lineHeight: 1,
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text3,
  cursor: 'pointer',
  transition: 'border-color 150ms, color 150ms, background 150ms',
};

const chipActive: React.CSSProperties = {
  ...chipBase,
  border: `1px solid ${C.ink}`,
  background: C.cta,
  color: C.ctaText,
};

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 32px',
  borderRadius: 12,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '-0.01em',
  background: C.cta,
  color: C.ctaText,
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(26,26,46,0.12)',
};

const btnGhost: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 32px',
  borderRadius: 12,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '-0.01em',
  background: C.surface,
  color: C.ink,
  border: `1px solid ${C.border}`,
  cursor: 'pointer',
  transition: 'border-color 150ms, background 150ms',
};

export function MyPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const admin = isDevAdmin();
  const { playlists, stats } = useProfileData();

  const [tags, setTags] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vibloc-user-tags');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [customTag, setCustomTag] = useState('');
  const [showAllPlaylists, setShowAllPlaylists] = useState(false);

  const saveTags = (next: string[]) => {
    setTags(next);
    localStorage.setItem('vibloc-user-tags', JSON.stringify(next));
  };
  const toggleTag = (tag: string) => {
    saveTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  };
  const addCustomTag = () => {
    const t = customTag.trim();
    if (!t || tags.includes(t)) return;
    saveTags([...tags, t]);
    setCustomTag('');
  };

  /* ── Not logged in ── */
  if (!user) {
    return (
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '128px 24px 64px',
          fontFamily: sans,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 24,
        }}
      >
        <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.6 }}>
          {PH.mypage.needLogin}
        </p>
        <Link to="/login" style={{ ...btnPrimary, textDecoration: 'none' }}>
          로그인
        </Link>
      </div>
    );
  }

  const visiblePlaylists = showAllPlaylists ? playlists : playlists.slice(0, 4);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '96px 24px 64px',
        fontFamily: sans,
      }}
    >
      {/* ━━━ PROFILE HEADER ━━━ */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h1
            style={{
              fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)',
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              color: C.ink,
              margin: 0,
            }}
          >
            {user.displayName ?? user.email}
          </h1>
          {admin && (
            <span
              style={{
                fontFamily: mono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '4px 8px',
                borderRadius: 6,
                background: C.cta,
                color: C.ctaText,
              }}
            >
              Admin
            </span>
          )}
        </div>
        <p style={{ marginTop: 4, fontSize: 13, color: C.text3, lineHeight: 1.4 }}>
          {user.email}
        </p>
      </div>

      {/* ━━━ STATS ━━━
          Same pattern as landing stats — mono numbers + uppercase labels.
          3-col with vertical dividers. */}
      <div
        style={{
          ...sectionBorder,
          paddingTop: 0,
          marginTop: 48,
          borderTop: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0,
        }}
      >
        {[
          { value: String(stats.totalTracks), label: '태그한 곡' },
          { value: String(stats.totalBuildings), label: '건물' },
          { value: String(tags.length), label: '관심 태그' },
        ].map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <div
                style={{
                  width: 1,
                  height: 48,
                  margin: '0 clamp(24px, 5vw, 48px)',
                  background: C.border,
                }}
              />
            )}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                minWidth: 64,
              }}
            >
              <span
                style={{
                  fontFamily: mono,
                  fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
                  fontWeight: 800,
                  lineHeight: 1,
                  color: C.ink,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.value}
              </span>
              <span style={sectionLabel}>{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ━━━ TOP GENRES ━━━ */}
      {stats.topGenres.length > 0 && (
        <div style={sectionBorder}>
          <p style={sectionLabel}>내 장르 분포</p>
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            {stats.topGenres.map(({ genre, count, color, label }) => (
              <div
                key={genre}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  borderRadius: 8,
                  background: color + '14',
                  border: `1px solid ${color}28`,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 10,
                    fontWeight: 500,
                    color: C.text3,
                  }}
                >
                  {count}곡
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ━━━ PLAYLISTS ━━━
          Bento-style 2-col grid matching landing features layout. */}
      <div style={sectionBorder}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <p style={sectionLabel}>내 플레이리스트</p>
          {playlists.length > 0 && (
            <span
              style={{
                fontFamily: mono,
                fontSize: 11,
                fontWeight: 500,
                color: C.text3,
              }}
            >
              {playlists.length}개 건물
            </span>
          )}
        </div>

        {playlists.length === 0 ? (
          <div
            style={{
              ...card,
              marginTop: 16,
              textAlign: 'center',
              border: `1px dashed ${C.border}`,
              padding: '48px 24px',
            }}
          >
            <p style={{ fontSize: 32, lineHeight: 1 }}>🎵</p>
            <p style={{ marginTop: 16, fontSize: 14, fontWeight: 500, color: C.text2 }}>
              아직 태그한 곡이 없어요
            </p>
            <p style={{ marginTop: 8, fontSize: 12, color: C.text3, lineHeight: 1.5 }}>
              맵에서 건물을 선택하고 음악을 태그해보세요
            </p>
            <Link
              to="/map"
              style={{
                ...btnPrimary,
                marginTop: 24,
                fontSize: 14,
                padding: '12px 24px',
                textDecoration: 'none',
              }}
            >
              맵에서 시작하기 →
            </Link>
          </div>
        ) : (
          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {visiblePlaylists.map((pl) => {
              const arts = pl.tracks.slice(0, 4).map((t) => t.artworkUrl).filter(Boolean);
              const trackCount = pl.tracks.length;
              const topTrack = [...pl.tracks].sort((a, b) => b.pinnedAt - a.pinnedAt)[0];

              return (
                <Link
                  key={pl.buildingId}
                  to="/map"
                  style={{
                    ...card,
                    padding: 16,
                    display: 'flex',
                    gap: 16,
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background 150ms, border-color 150ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(26,26,46,0.06)';
                    e.currentTarget.style.borderColor = 'rgba(26,26,46,0.16)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = C.surface;
                    e.currentTarget.style.borderColor = 'rgba(26,26,46,0.08)';
                  }}
                >
                  {/* Artwork mosaic */}
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 12,
                      overflow: 'hidden',
                      flexShrink: 0,
                      background: C.surface,
                    }}
                  >
                    {arts.length >= 4 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', width: '100%', height: '100%' }}>
                        {arts.slice(0, 4).map((url, i) => (
                          <img key={i} src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                        ))}
                      </div>
                    ) : arts.length > 0 ? (
                      <img src={arts[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🏙</div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                        건물 {shortBuildingName(pl.buildingId)}
                      </span>
                      <span style={{ fontFamily: mono, fontSize: 10, color: C.text3 }}>
                        {trackCount}곡
                      </span>
                    </div>
                    {pl.description && (
                      <p style={{ fontSize: 12, color: C.text2, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                        {pl.description}
                      </p>
                    )}
                    {topTrack && (
                      <p style={{ fontSize: 11, color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                        ♪ {topTrack.trackName} — {topTrack.artistName}
                      </p>
                    )}
                    <p style={{ fontFamily: mono, fontSize: 10, color: C.text3, opacity: 0.6, margin: 0 }}>
                      {timeAgo(pl.lastActivity)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {playlists.length > 4 && (
          <button
            type="button"
            onClick={() => setShowAllPlaylists(!showAllPlaylists)}
            style={{
              marginTop: 16,
              width: '100%',
              padding: '12px 0',
              borderRadius: 12,
              border: `1px solid ${C.border}`,
              background: 'transparent',
              fontSize: 12,
              fontWeight: 600,
              color: C.text2,
              cursor: 'pointer',
              transition: 'background 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.surface; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {showAllPlaylists ? '접기' : `전체 보기 (+${playlists.length - 4})`}
          </button>
        )}
      </div>

      {/* ━━━ RECENT ACTIVITY ━━━ */}
      {stats.recentTracks.length > 0 && (
        <div style={sectionBorder}>
          <p style={sectionLabel}>최근 활동</p>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stats.recentTracks.map((t, i) => (
              <div
                key={`${t.id}-${t.buildingId}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '10px 12px',
                  borderRadius: 12,
                  transition: 'background 150ms',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.surface; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <img
                  src={t.artworkUrl}
                  alt=""
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                  loading="lazy"
                />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: C.ink,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.trackName}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: C.text2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.artistName} · 건물 {shortBuildingName(t.buildingId)}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 10,
                    color: C.text3,
                    flexShrink: 0,
                  }}
                >
                  {timeAgo(t.pinnedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ━━━ INTEREST TAGS ━━━ */}
      <div style={sectionBorder}>
        <p style={sectionLabel}>관심 장르 태그</p>
        <p style={{ marginTop: 8, fontSize: 13, color: C.text2, lineHeight: 1.5 }}>
          태그를 선택하면 맵에서 추천이 개인화됩니다
        </p>

        {/* Preset chips — same pattern as landing city chips */}
        <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TAG_PRESETS.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                style={active ? chipActive : chipBase}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.borderColor = C.borderHover;
                    e.currentTarget.style.color = C.text2;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.borderColor = 'rgba(26,26,46,0.08)';
                    e.currentTarget.style.color = C.text3;
                  }
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* Custom tag input */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
            placeholder="직접 입력..."
            style={{
              flex: 1,
              minWidth: 0,
              padding: '10px 14px',
              borderRadius: 12,
              border: `1px solid ${C.border}`,
              background: C.cardBg,
              fontSize: 13,
              color: C.ink,
              outline: 'none',
              transition: 'border-color 150ms',
              fontFamily: 'inherit',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = C.borderHover; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(26,26,46,0.08)'; }}
          />
          <button
            type="button"
            onClick={addCustomTag}
            disabled={!customTag.trim()}
            style={{
              ...btnPrimary,
              fontSize: 13,
              padding: '10px 20px',
              opacity: customTag.trim() ? 1 : 0.35,
              cursor: customTag.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            추가
          </button>
        </div>

        {/* Selected tags */}
        {tags.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p
              style={{
                ...sectionLabel,
                fontSize: 10,
                marginBottom: 8,
              }}
            >
              내 태그 ({tags.length})
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: C.surface,
                    fontSize: 12,
                    fontWeight: 500,
                    color: C.ink,
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-label={`${tag} 제거`}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: 14,
                      color: C.text3,
                      cursor: 'pointer',
                      lineHeight: 1,
                      transition: 'color 150ms',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = C.ink; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = C.text3; }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ━━━ ACTIONS ━━━ */}
      <div
        style={{
          marginTop: 48,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <Link
          to="/map"
          style={{ ...btnGhost, textDecoration: 'none', fontSize: 14, padding: '12px 24px' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = C.borderHover;
            e.currentTarget.style.background = 'rgba(26,26,46,0.06)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(26,26,46,0.08)';
            e.currentTarget.style.background = C.surface;
          }}
        >
          맵으로 →
        </Link>
        <button
          type="button"
          onClick={() => {
            clearSession();
            navigate('/');
          }}
          style={{
            ...btnGhost,
            fontSize: 14,
            padding: '12px 24px',
            color: C.danger,
            border: `1px solid ${C.dangerBorder}`,
            background: C.dangerBg,
          }}
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
