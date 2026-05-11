/**
 * Click / hover-triggered left-flowing marquee for overflowing text.
 *
 * Behavior:
 *   • Default — static text with native ellipsis truncation. Zero
 *     motion on the page so unfocused content stays calm.
 *   • Hover (mouse) OR click (sticky toggle) — text starts flowing
 *     left in a seamless infinite loop until the user moves away
 *     (hover) or clicks again (toggle off). Touch devices have no
 *     hover so the click toggle is the primary affordance.
 *   • Reduced motion — collapses to static ellipsis regardless.
 *
 * The two-copy + `--mq-cycle` translateX trick makes the loop
 * seamless: at the end of one cycle, copy B has reached exactly
 * where copy A started, so the next iteration is invisible.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';

type Props = {
  text: string;
  style?: CSSProperties;
  title?: string;
  /** Pixels-per-second scroll speed. Default 32 — iOS Lock-screen
   *  NowPlaying scrolls at ~28-32 px/s. */
  speedPxPerSec?: number;
  /** Gap between the duplicated copies. Default 48. */
  gapPx?: number;
  className?: string;
  /** When true, clicking on the marquee no longer toggles the
   *  sticky scroll — useful when the marquee lives inside an
   *  enclosing `<a>` / clickable card so the click can bubble up
   *  to navigation. The flow is then driven purely by hover (or
   *  by an ancestor's `:hover` rule). */
  disableClick?: boolean;
};

export function MarqueeText({
  text, style, title, speedPxPerSec = 32, gapPx = 48, className,
  disableClick = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [textWidth, setTextWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const measure = () => {
      const tw = inner.scrollWidth;
      const ww = wrap.clientWidth;
      setTextWidth(tw);
      const next = tw - ww > 1;
      setOverflowing(next);
      // Auto-deactivate the sticky flow if the text starts fitting
      // again (e.g., container resized wider).
      if (!next) setActive(false);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [text]);

  const cycleDist = textWidth + gapPx;
  const duration = cycleDist > 0 ? cycleDist / speedPxPerSec : 0;

  return (
    <div
      ref={wrapRef}
      className={[
        'vibloc-mq',
        overflowing ? 'is-overflow' : '',
        active ? 'is-active' : '',
        className,
      ].filter(Boolean).join(' ')}
      title={title ?? text}
      aria-label={title ?? text}
      onClick={(e) => {
        // Only toggle when text is actually overflowing — clicking
        // a fully-visible label shouldn't start a meaningless loop.
        // `disableClick` lets a parent (e.g. card link) absorb the
        // click for navigation instead of the marquee swallowing it.
        if (disableClick) return;
        if (overflowing) {
          e.stopPropagation();
          setActive((v) => !v);
        }
      }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        cursor: overflowing ? 'pointer' : style?.cursor ?? 'inherit',
        ['--mq-cycle' as string]: `-${cycleDist}px`,
        ['--mq-duration' as string]: `${duration}s`,
        ['--mq-gap' as string]: `${gapPx}px`,
        ...style,
      }}
    >
      {overflowing ? (
        <span
          className="vibloc-mq-track"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: `var(--mq-gap)`,
            willChange: 'transform',
          }}
        >
          <span ref={innerRef} style={{ display: 'inline-block' }}>{text}</span>
          <span aria-hidden="true" style={{ display: 'inline-block' }}>{text}</span>
        </span>
      ) : (
        <span ref={innerRef} style={{ display: 'inline-block' }}>{text}</span>
      )}
    </div>
  );
}
