/**
 * NowPlayingEQ — small 3-bar equalizer that plays when a track row
 * is the currently playing track. Mirrors Apple Music's "now
 * playing" indicator: a tiny animated stack of bars sitting where
 * the row's leading icon / artwork overlay normally lives.
 *
 * Why a bespoke component (vs lucide audio-lines etc.):
 *   • lucide's `audio-lines` is a static glyph — no animation primitive
 *   • a 3-bar pure-CSS approach keeps it dependency-free and lets us
 *     vary bar phase per-bar so the motion reads as random rather
 *     than three bars in lockstep
 *
 * Props:
 *   • size      — outer square in px (default 14)
 *   • color     — bar color (default currentColor so it inherits
 *                 the row's text token)
 *   • paused    — freezes the bars in place. Use when the track is
 *                 selected/current but the player is paused.
 */
import type { CSSProperties } from 'react';

type Props = {
  size?: number;
  color?: string;
  paused?: boolean;
  /** Optional override for the outer container styling. */
  style?: CSSProperties;
  /** A11y — shown to screen readers via aria-label. */
  ariaLabel?: string;
};

export function NowPlayingEQ({
  size = 14, color = 'currentColor', paused = false,
  style, ariaLabel = 'Now playing',
}: Props) {
  // Three bars with staggered start delays so the motion is
  // perceptually random. Heights are kept in % of the parent so
  // `size` scales the whole indicator.
  const barWidth = Math.max(2, Math.round(size / 6));
  const gap = Math.max(1, Math.round(size / 8));
  const animation = paused ? 'none' : 'vbk-eq-bar 900ms ease-in-out infinite';
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap,
        width: size, height: size,
        ...style,
      }}
    >
      <span style={{
        width: barWidth, background: color, borderRadius: 1,
        height: paused ? '40%' : '60%',
        transformOrigin: 'bottom',
        animation,
        animationDelay: '0ms',
      }} />
      <span style={{
        width: barWidth, background: color, borderRadius: 1,
        height: paused ? '60%' : '90%',
        transformOrigin: 'bottom',
        animation,
        animationDelay: '180ms',
      }} />
      <span style={{
        width: barWidth, background: color, borderRadius: 1,
        height: paused ? '40%' : '70%',
        transformOrigin: 'bottom',
        animation,
        animationDelay: '360ms',
      }} />
      <style>{`
        @keyframes vbk-eq-bar {
          0%, 100% { transform: scaleY(0.35); }
          50%      { transform: scaleY(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes vbk-eq-bar {
            0%, 100% { transform: scaleY(0.7); }
            50%      { transform: scaleY(0.7); }
          }
        }
      `}</style>
    </span>
  );
}
