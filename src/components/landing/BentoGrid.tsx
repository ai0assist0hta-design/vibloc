"use client";

import { motion } from "framer-motion";

const cards = [
  {
    icon: <span className="text-3xl">🌏</span>,
    title: "6개 도시, 50,000+ 건물",
    desc: "도쿄 · 서울 · LA · 맨해튼을 3D로 탐험",
  },
  {
    icon: (
      <span className="text-3xl font-bold" style={{ color: "#ff2d6f" }}>
        ◆
      </span>
    ),
    title: "환경 맞춤 AI 추천",
    desc: "날씨 · 시간 · 계절 · 건물 테넌트가 플레이리스트를 바꿈",
  },
  {
    icon: (
      <motion.span
        className="inline-block text-2xl"
        style={{ color: "#4CAF50" }}
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        ●
      </motion.span>
    ),
    title: "실시간 동기화",
    desc: "현재 시간의 태양 · 날씨 · 차트가 도시에 반영",
  },
  {
    icon: (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: "#ff2d6f" }}
        />
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: "#7b5cff" }}
        />
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: "#00b3c4" }}
        />
      </span>
    ),
    title: "7 장르 패밀리",
    desc: "18개 장르를 7가지 색으로 한눈에",
  },
];

export function BentoGrid() {
  return (
    <section
      className="mx-auto w-full max-w-3xl px-4"
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 32, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0 }}
            transition={{
              delay: i * 0.12,
              duration: 0.5,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            whileHover={{ scale: 1.03 }}
            className="cursor-default rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-sm transition-colors duration-200 hover:bg-white/[0.07]"
          >
            <div className="mb-4">{card.icon}</div>
            <h3
              className="mb-1.5 text-base font-semibold"
              style={{ color: "#f5f4f1" }}
            >
              {card.title}
            </h3>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "rgba(245,244,241,0.55)" }}
            >
              {card.desc}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
