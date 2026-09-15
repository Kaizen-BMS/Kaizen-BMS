"use client";

import { motion } from "framer-motion";
import { NodeDot, Crosshair } from "./graphics/primitives";

/**
 * The homepage hero visual — replaces the earlier abstract orbital-field
 * graphic, which didn't reference the business at all. This one is a
 * direct, literal read of the tagline it sits next to: a staircase of
 * small ascending bars ("Small Improvements") with a line tracing up and
 * over them to a single bright endpoint ("Extraordinary Results") — the
 * Kaizen idea (continuous incremental improvement -> a real outcome)
 * rendered as one shape instead of a decorative field with no meaning.
 * Custom SVG only, per the design system — nothing borrowed from an icon set.
 */

const BARS = [
  { x: 40, w: 46, h: 70 },
  { x: 104, w: 46, h: 120 },
  { x: 168, w: 46, h: 180 },
  { x: 232, w: 46, h: 250 },
  { x: 296, w: 46, h: 340 },
];
const BASE_Y = 460;
const ACCENT = "#08DCDC";

function barTop(bar) {
  return { x: bar.x + bar.w / 2, y: BASE_Y - bar.h };
}

export default function GrowthGraphic({ className = "" }) {
  const linePoints = BARS.map(barTop);
  const path = `M${linePoints[0].x - 22},${linePoints[0].y + 26} ${linePoints
    .map((p) => `L${p.x},${p.y - 10}`)
    .join(" ")}`;
  const endpoint = linePoints[linePoints.length - 1];

  return (
    <div className={`relative select-none ${className}`} aria-hidden="true">
      <svg viewBox="0 0 420 520" className="h-full w-full" fill="none">
        {/* baseline */}
        <line x1="10" y1={BASE_Y} x2="410" y2={BASE_Y} stroke="var(--kbms-line)" strokeWidth="1" />

        {/* ascending bars — each a "small improvement," rising into view in sequence */}
        {BARS.map((bar, i) => (
          <motion.rect
            key={bar.x}
            x={bar.x}
            width={bar.w}
            height={bar.h}
            y={BASE_Y - bar.h}
            rx={2}
            fill={i === BARS.length - 1 ? ACCENT : "var(--kbms-ink)"}
            fillOpacity={i === BARS.length - 1 ? 0.9 : 0.1 + i * 0.03}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.6, delay: 0.15 * i, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: `${bar.x + bar.w / 2}px ${BASE_Y}px` }}
          />
        ))}

        {/* the trajectory tying every bar to the next — "extraordinary results" as a path, not a single leap */}
        <motion.path
          d={path}
          stroke={ACCENT}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="4 5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, delay: 0.9, ease: "easeOut" }}
        />

        {/* the result — a calm, slow pulse at the trajectory's endpoint */}
        <motion.circle
          cx={endpoint.x}
          cy={endpoint.y - 10}
          r={7}
          fill={ACCENT}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.4, 1], opacity: 1 }}
          transition={{ duration: 0.6, delay: 2.1, ease: "easeOut" }}
        />
        <motion.circle
          cx={endpoint.x}
          cy={endpoint.y - 10}
          r={7}
          fill="none"
          stroke={ACCENT}
          strokeWidth="1"
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
          transition={{ duration: 2.2, delay: 2.3, repeat: Infinity, ease: "easeOut" }}
        />
      </svg>

      <Crosshair size={18} className="absolute right-[8%] top-[10%] opacity-60" />
      <NodeDot r={2.5} className="absolute bottom-[30%] left-[4%] opacity-70" />
    </div>
  );
}
