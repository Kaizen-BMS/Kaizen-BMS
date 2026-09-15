"use client";

import { motion } from "framer-motion";
import { CyanBlob, NodeDot } from "./graphics/primitives";

/**
 * The homepage hero visual, v3. v1 (ascending bars) read as a flat
 * infographic; v2 (a dashboard-panel mockup) read as a foreign UI
 * screenshot glued onto an editorial, line-art page — it didn't blend.
 * This version keeps the same visual DNA as the original OrbitalGraphic
 * (soft blob + thin rotating orbit rings + small node dots — nobody
 * disliked how that one LOOKED, only that it had no meaning) and adds
 * exactly one legible element on top: a single flowing line rising from
 * lower-left to upper-right through the rings, ending in a glowing point —
 * "Small Improvements" (the gentle climb, small waypoint nodes along it)
 * arriving at "Extraordinary Results" (the bright endpoint). Still custom
 * SVG/CSS only, thin strokes, calm motion — no boxes, no shadows, no UI
 * chrome that would look pasted on top of the page.
 */

const ACCENT = "#08DCDC";

const FLOW_PATH =
  "M110,470 C160,440 190,380 230,360 C270,340 290,300 320,280 " +
  "C360,255 380,210 420,185 C455,163 465,140 490,110";

const WAYPOINTS = [
  { cx: 150, cy: 428 },
  { cx: 260, cy: 330 },
  { cx: 380, cy: 220 },
];

export default function GrowthGraphic({ className = "" }) {
  return (
    <div className={`relative select-none ${className}`} aria-hidden="true">
      {/* cyan organic field, very slow morph + float — same as the original */}
      <div className="absolute inset-0 kbms-float">
        <CyanBlob className="h-full w-full" opacity={0.5} />
      </div>

      {/* orbital rings, slow independent rotation — same visual language as
          every other abstract graphic on this site */}
      <motion.svg
        viewBox="0 0 600 600"
        className="absolute inset-0 h-full w-full"
        style={{ transformOrigin: "300px 300px" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
      >
        <circle cx="300" cy="300" r="230" fill="none" stroke="var(--kbms-ink)" strokeOpacity="0.12" strokeWidth="1" />
        <circle cx="300" cy="300" r="170" fill="none" stroke="var(--kbms-ink)" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="1 7" />
      </motion.svg>

      {/* the one meaningful line: a gentle climb through the rings, ending
          in a glowing result — drawn once on load, then settles */}
      <svg viewBox="0 0 600 600" className="absolute inset-0 h-full w-full">
        <motion.path
          d={FLOW_PATH}
          fill="none"
          stroke={ACCENT}
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.9 }}
          transition={{ duration: 2.2, delay: 0.3, ease: "easeInOut" }}
        />

        {WAYPOINTS.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.cx}
            cy={p.cy}
            r="3.5"
            fill="var(--kbms-ink)"
            fillOpacity="0.55"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.6 + i * 0.55 }}
          />
        ))}

        {/* the result — a calm, slow pulse at the line's end */}
        <motion.circle
          cx="490"
          cy="110"
          r="6"
          fill={ACCENT}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 2.4, ease: "easeOut" }}
        />
        <motion.circle
          cx="490"
          cy="110"
          r="6"
          fill="none"
          stroke={ACCENT}
          strokeWidth="1"
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: [1, 2.6], opacity: [0.6, 0] }}
          transition={{ duration: 2.4, delay: 2.6, repeat: Infinity, ease: "easeOut" }}
        />
      </svg>

      <NodeDot r={3} className="absolute bottom-[18%] left-[22%] opacity-70" />
    </div>
  );
}
