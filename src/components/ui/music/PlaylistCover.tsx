/**
 * Playlist cover renderer.
 *
 * Two visual modes, picked per playlist:
 *
 *   1. Custom image (`customUrl`)  — single full-bleed photo. Used
 *      for personas with a curated cover the user picked manually.
 *      Drop files in `public/playlist-covers/` and reference them
 *      from `seedAgents.ts`.
 *
 *   2. Track-art mosaic (default)  — 2×2 grid of the playlist's
 *      top track artworks. Mirrors the "smart cover" Apple Music /
 *      Spotify generate from playlist contents when the user hasn't
 *      uploaded one. Falls back to a 1×1 (single artwork) when only
 *      one track has art, then to an initial monogram.
 *
 * Always rendered as a square with rounded corners, matching the
 * other album-art tiles in VIBLOC.
 */

import { useState, type CSSProperties } from 'react';

type Props = {
  /** Optional override — full-bleed single image. Falls back to the
   *  mosaic / single / monogram chain if the URL 404s (e.g. the
   *  custom cover file hasn't been uploaded to public/ yet). */
  customUrl?: string | null;
  /** Up to 4 track artwork URLs for the mosaic fallback. */
  artworkUrls: (string | null | undefined)[];
  /** Used as monogram alt text when no images are available. */
  fallbackText: string;
  size: number;
  /** Border radius. Default 14 px (matches FeaturedHero). */
  radius?: number;
  divider: string;
  text2: string;
  /** Optional extra style for the outer container. */
  style?: CSSProperties;
};

export function PlaylistCover({
  customUrl, artworkUrls, fallbackText, size,
  radius = 14, divider, text2, style,
}: Props) {
  const usable = artworkUrls.filter((u): u is string => !!u);
  // When the custom URL fails to load (404, broken host, CORS, etc.)
  // we want the cover to silently fall through to the mosaic instead
  // of leaving a giant alt-text rectangle on screen.
  const [customBroken, setCustomBroken] = useState(false);
  // First-track image broken? Drop it from the chain too.
  const [singleBroken, setSingleBroken] = useState(false);

  const useCustom = !!customUrl && !customBroken;
  const usableLive = singleBroken ? usable.slice(1) : usable;

  return (
    <div
      style={{
        position: 'relative',
        width: size, height: size,
        flexShrink: 0,
        borderRadius: radius,
        overflow: 'hidden',
        border: `1px solid ${divider}`,
        boxShadow: '0 12px 28px rgba(0,0,0,0.16)',
        background: divider,
        ...style,
      }}
    >
      {useCustom ? (
        <img
          src={customUrl!}
          alt={fallbackText}
          width={size} height={size}
          loading="eager" decoding="async" referrerPolicy="no-referrer"
          onError={() => setCustomBroken(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : usableLive.length >= 4 ? (
        <Mosaic urls={usableLive.slice(0, 4)} alt={fallbackText} />
      ) : usableLive.length >= 1 ? (
        <img
          src={usableLive[0]}
          alt={fallbackText}
          width={size} height={size}
          loading="eager" decoding="async" referrerPolicy="no-referrer"
          onError={() => setSingleBroken(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <Monogram text={fallbackText} text2={text2} />
      )}
    </div>
  );
}

function Mosaic({ urls, alt }: { urls: string[]; alt: string }) {
  return (
    <div
      role="img"
      aria-label={alt}
      style={{
        width: '100%', height: '100%',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 0, // tiles touch — no seam between mosaic frames
      }}
    >
      {urls.map((u, i) => (
        <img
          key={i}
          src={u}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ))}
    </div>
  );
}

function Monogram({ text, text2 }: { text: string; text2: string }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: text2,
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 40, fontWeight: 800,
    }}>
      {(text.trim().charAt(0) || '?').toUpperCase()}
    </div>
  );
}
