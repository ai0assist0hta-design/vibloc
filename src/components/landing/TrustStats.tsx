"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface StatItem {
  target: number;
  display: (n: number) => string;
  label: string;
}

const stats: StatItem[] = [
  {
    target: 6,
    display: (n) => String(Math.round(n)),
    label: "CITIES",
  },
  {
    target: 50000,
    display: (n) => Math.round(n).toLocaleString("en-US") + "+",
    label: "BUILDINGS",
  },
  {
    target: 7,
    display: (n) => String(Math.round(n)),
    label: "GENRE FAMILIES",
  },
];

function useCountUp(target: number, active: boolean, duration = 1500) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;

    let start: number | null = null;
    let rafId: number;

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(eased * target);

      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [active, target, duration]);

  return value;
}

function StatBlock({ stat }: { stat: StatItem }) {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = useCountUp(stat.target, active);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setActive(true); obs.disconnect(); } },
      { threshold: 0 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex flex-col items-center gap-2 py-4 sm:py-0">
      <span
        className="text-3xl font-bold sm:text-4xl"
        style={{ color: "#f5f4f1", fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {stat.display(count)}
      </span>
      <span
        className="text-xs tracking-[0.2em] uppercase"
        style={{
          color: "rgba(245,244,241,0.4)",
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        {stat.label}
      </span>
    </div>
  );
}

export function TrustStats() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="w-full"
    >
      <div className="flex flex-col items-center justify-center gap-0 sm:flex-row">
        {stats.map((stat, i) => (
          <div key={stat.label} className="flex flex-col items-center sm:flex-row">
            {i > 0 && (
              <>
                <div className="mx-8 hidden h-12 w-px bg-white/10 sm:block" />
                <div className="my-2 block h-px w-16 bg-white/10 sm:hidden" />
              </>
            )}
            <StatBlock stat={stat} />
          </div>
        ))}
      </div>
    </motion.section>
  );
}
