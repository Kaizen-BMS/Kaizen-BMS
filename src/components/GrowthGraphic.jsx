"use client";

import { motion } from "framer-motion";
import { CyanBlob } from "./graphics/primitives";

/**
 * The homepage hero visual, v2 — the first pass (ascending bars + a
 * trajectory line) was meaningful but read as a flat diagram/infographic.
 * This version is a tangible dashboard-panel mockup instead: a soft glow
 * behind a floating "product screen" — a real-looking trend chart with a
 * gradient fill and a couple of KPI rows — plus a small floating metric
 * badge overlapping its corner, the way an actual product screenshot or
 * device mockup sits in a modern SaaS hero. Depth comes from layered
 * translucency, blur and drop-shadow rather than flat thin strokes.
 * Custom SVG/CSS only, per the design system — nothing borrowed from an
 * icon set or a stock photo.
 */

const ACCENT = "#08DCDC";
const ACCENT_2 = "#6E5BFF";

// A believable upward trend, not a straight diagonal — small dips included
// so the chart reads as real data rather than a drawn arrow.
const CHART_POINTS = [
  [0, 150], [30, 138], [60, 142], [90, 112], [120, 118],
  [150, 88], [180, 96], [210, 64], [240, 48], [260, 30],
];

function smoothPath(points) {
  return points
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(" ");
}

export default function GrowthGraphic({ className = "" }) {
  const linePath = smoothPath(CHART_POINTS);
  const last = CHART_POINTS[CHART_POINTS.length - 1];
  const areaPath = `${linePath} L${last[0]},176 L0,176 Z`;

  return (
    <div
      className={`relative flex select-none items-center justify-center ${className}`}
      aria-hidden="true"
    >
      {/* ambient glow behind the panel — depth, not a flat background */}
      <div className="kbms-float absolute inset-0 -z-10">
        <CyanBlob className="h-full w-full" opacity={0.35} />
      </div>

      {/* the main panel — a real-looking product screen, not a diagram */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-90 overflow-hidden rounded-2xl border border-(--kbms-line) bg-(--kbms-bg)"
        style={{
          boxShadow:
            "0 30px 60px -20px rgba(0,0,0,0.28), 0 10px 24px -12px rgba(0,0,0,0.18)",
        }}
      >
        {/* title bar */}
        <div className="flex items-center justify-between border-b border-(--kbms-line) px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-(--kbms-ink)/15" />
            <span className="h-2 w-2 rounded-full bg-(--kbms-ink)/15" />
            <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />
          </div>
          <span className="font-body text-[10px] font-medium uppercase tracking-[0.14em] text-(--kbms-ink-soft)">
            Growth
          </span>
        </div>

        {/* chart */}
        <div className="px-4 pt-4">
          <svg viewBox="0 0 260 176" className="h-[150px] w-full">
            <defs>
              <linearGradient id="kbms-hero-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.35" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* quiet horizontal guides */}
            {[44, 88, 132].map((y) => (
              <line key={y} x1="0" y1={y} x2="260" y2={y} stroke="var(--kbms-line)" strokeWidth="1" />
            ))}

            <motion.path
              d={areaPath}
              fill="url(#kbms-hero-area)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.1 }}
            />
            <motion.path
              d={linePath}
              fill="none"
              stroke={ACCENT}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.3, delay: 0.5, ease: "easeOut" }}
            />
            <motion.circle
              cx={last[0]}
              cy={last[1]}
              r="4.5"
              fill={ACCENT}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, delay: 1.8 }}
            />
          </svg>
        </div>

        {/* two quiet KPI rows — grounds the panel as "a real screen," not just a chart */}
        <div className="space-y-2.5 px-4 pb-4 pt-1">
          {[
            { label: "Operational efficiency", value: 0.82, color: ACCENT },
            { label: "Process maturity", value: 0.64, color: ACCENT_2 },
          ].map((row, i) => (
            <div key={row.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-body text-[10px] text-(--kbms-ink-soft)">{row.label}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--kbms-ink)/8">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: row.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${row.value * 100}%` }}
                  transition={{ duration: 0.9, delay: 1.3 + i * 0.15, ease: "easeOut" }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* a small floating metric badge overlapping the panel's corner —
          the detail that reads as "a real product," not a flat graphic */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 1.9, ease: [0.16, 1, 0.3, 1] }}
        className="kbms-float absolute -right-3 -top-3 flex items-center gap-1.5 rounded-xl border border-(--kbms-line) bg-(--kbms-bg) px-3 py-2"
        style={{ boxShadow: "0 16px 30px -12px rgba(0,0,0,0.25)" }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 10L6 5L9 8L12 3" fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 3H12V6" fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-display text-sm text-(--kbms-ink)">+24%</span>
      </motion.div>
    </div>
  );
}
