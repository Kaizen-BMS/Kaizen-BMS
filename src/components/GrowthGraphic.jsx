"use client";

import { motion } from "framer-motion";
import { INK, LINE, ACCENT, ACCENT_2 } from "./graphics/primitives";

/**
 * The homepage hero visual, v4 — a dense "data/systems" collage (per an
 * owner-supplied reference image: a tech-dashboard illustration with a
 * central 3D hex core surrounded by small chart/grid/radar widgets), but
 * hand-built as custom SVG in this site's own palette rather than the
 * reference's literal gray/orange stock-illustration colors — the design
 * system requires custom SVG only, no stock imagery, so this reproduces
 * the COMPOSITION (a busy ring of small abstract data widgets around one
 * glowing center), not the source pixels. Every widget below is a small,
 * self-contained group so the whole thing stays legible to edit later.
 */

const w = { stroke: INK, opacity: 0.28 };

/**
 * Wraps a widget so it drifts away from its resting spot and springs back
 * — a small, springy overshoot on each reversal reads as "bumping into"
 * the edge of its own little orbit and bouncing off it, rather than a
 * flat back-and-forth slide. Each caller gets its own distance/speed/
 * offset so the whole collage feels loosely alive instead of one
 * synchronized pulse.
 */
function Float({ dx = 10, dy = 8, duration = 2.4, delay = 0, children }) {
  return (
    <motion.g
      animate={{ x: [0, dx, 0], y: [0, dy, 0] }}
      transition={{
        duration,
        repeat: Infinity,
        repeatDelay: 0.15,
        ease: [0.34, 1.56, 0.64, 1], // overshoot-then-settle — the "bounce"
        delay,
      }}
    >
      {children}
    </motion.g>
  );
}

/** A jagged connected-dot line, like a small stock/analytics chart. */
function ZigzagChart({ x, y }) {
  const pts = [
    [0, 34], [16, 20], [32, 26], [48, 8], [64, 16], [80, 2], [96, 12],
  ];
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  return (
    <g transform={`translate(${x},${y})`}>
      <path d={d} fill="none" stroke={w.stroke} strokeOpacity={w.opacity} strokeWidth="1" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === 4 ? 2.5 : 1.6} fill={i === 4 ? ACCENT : INK} fillOpacity={i === 4 ? 1 : 0.4} />
      ))}
    </g>
  );
}

/** A small equalizer-style bar cluster, uneven heights. */
function EqBars({ x, y, heights = [10, 18, 8, 22, 14, 26, 12] }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {heights.map((h, i) => (
        <rect key={i} x={i * 7} y={26 - h} width="3" height={h} fill={INK} fillOpacity="0.18" />
      ))}
    </g>
  );
}

function DashedCircle({ x, y, r, color = LINE }) {
  return <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 5" opacity="0.6" />;
}

/** A couple of overlapping thin circles — reads as a quiet Venn/scope glyph. */
function OverlapCircles({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle cx="0" cy="0" r="22" fill="none" stroke={INK} strokeOpacity="0.2" strokeWidth="1" />
      <circle cx="18" cy="6" r="14" fill="none" stroke={ACCENT_2} strokeOpacity="0.4" strokeWidth="1" />
    </g>
  );
}

/** A handful of scattered nodes with thin connecting lines. */
function MiniScatter({ x, y }) {
  const pts = [[0, 30], [26, 10], [46, 34], [70, 4], [88, 22]];
  const edges = [[0, 1], [1, 2], [1, 3], [3, 4]];
  return (
    <g transform={`translate(${x},${y})`}>
      {edges.map(([a, b], i) => (
        <line key={i} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke={INK} strokeOpacity="0.18" strokeWidth="1" />
      ))}
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={i === 3 ? 3 : 2} fill={i === 3 ? ACCENT : INK} fillOpacity={i === 3 ? 1 : 0.4} />
      ))}
    </g>
  );
}

/** Numbered data rows — a tiny square marker, a thin bar, a "01"-style index. */
function NumberedRows({ x, y, start = 1, count = 5 }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {Array.from({ length: count }).map((_, i) => (
        <g key={i} transform={`translate(0,${i * 15})`}>
          <rect x="0" y="0" width="6" height="6" fill="none" stroke={INK} strokeOpacity="0.3" strokeWidth="1" />
          <rect x="14" y="2" width={40 - i * 3} height="2" fill={i === 1 ? ACCENT : INK} fillOpacity={i === 1 ? 0.8 : 0.18} />
          <text x="90" y="6" fontSize="7" fill={INK} fillOpacity="0.3" fontFamily="var(--font-body)">
            {String(start + i).padStart(2, "0")}
          </text>
        </g>
      ))}
    </g>
  );
}

/** A quiet grid of small squares — a couple filled, most just outlined. */
function SquareGrid({ x, y, rows = 2, cols = 4, filled = [1, 5] }) {
  const cells = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(
        <rect
          key={idx}
          x={c * 16}
          y={r * 16}
          width="12"
          height="12"
          fill={filled.includes(idx) ? ACCENT_2 : "none"}
          fillOpacity={filled.includes(idx) ? 0.35 : 1}
          stroke={INK}
          strokeOpacity="0.2"
          strokeWidth="1"
        />,
      );
      idx++;
    }
  }
  return <g transform={`translate(${x},${y})`}>{cells}</g>;
}

/** A row of small diamond outlines. */
function DiamondRow({ x, y, count = 5, gap = 22 }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {Array.from({ length: count }).map((_, i) => (
        <rect
          key={i}
          x={i * gap}
          y="0"
          width="10"
          height="10"
          fill="none"
          stroke={INK}
          strokeOpacity="0.22"
          strokeWidth="1"
          transform={`rotate(45 ${i * gap + 5} 5)`}
        />
      ))}
    </g>
  );
}

/** Concentric "radar" rings — the collage's stand-in for the reference's radiating-triangle clusters. */
function RadarRings({ x, y, sizes = [8, 16, 24, 32] }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {sizes.map((r, i) => (
        <circle key={i} cx="0" cy="0" r={r} fill="none" stroke={INK} strokeOpacity={0.28 - i * 0.05} strokeWidth="1" />
      ))}
      <circle cx="0" cy="0" r="2" fill={ACCENT} />
    </g>
  );
}

/** The center of the whole graphic: an isometric hex "block" with a glowing core cell, orbited by a couple of slow dashed rings. */
function HexCore({ cx, cy, size = 78 }) {
  const top = [[0, -size], [size * 0.87, -size * 0.5], [size * 0.87, size * 0.5], [0, size], [-size * 0.87, size * 0.5], [-size * 0.87, -size * 0.5]];
  const topFace = `M${top.map((p) => p.join(",")).join(" L")} Z`;
  return (
    <g transform={`translate(${cx},${cy})`}>
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 70, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "0px 0px" }}
      >
        <circle r={size * 1.55} fill="none" stroke={LINE} strokeWidth="1" strokeDasharray="1 8" />
      </motion.g>
      <motion.g
        animate={{ rotate: -360 }}
        transition={{ duration: 95, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "0px 0px" }}
      >
        <circle r={size * 1.25} fill="none" stroke={LINE} strokeWidth="1" />
      </motion.g>

      <path d={topFace} fill="var(--kbms-bg)" stroke={INK} strokeOpacity="0.25" strokeWidth="1.25" />
      <path d={`M0,-${size} L${size * 0.87},-${size * 0.5} L${size * 0.87},${size * 0.5} L0,0 Z`} fill={INK} fillOpacity="0.06" />
      <path d={`M0,-${size} L${-size * 0.87},-${size * 0.5} L${-size * 0.87},${size * 0.5} L0,0 Z`} fill={INK} fillOpacity="0.03" />

      <motion.circle
        r={size * 0.22}
        fill={ACCENT}
        initial={{ opacity: 0.7 }}
        animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.08, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </g>
  );
}

export default function GrowthGraphic({ className = "" }) {
  return (
    <motion.div
      className={`relative select-none ${className}`}
      aria-hidden="true"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }}
    >
      <svg viewBox="0 0 900 620" className="h-full w-full overflow-visible">
        {/* quiet dotted-grid texture, same restrained density as DataPoints elsewhere */}
        <g opacity="0.5">
          {Array.from({ length: 14 }).map((_, r) =>
            Array.from({ length: 20 }).map((_, c) => (
              <circle key={`${r}-${c}`} cx={20 + c * 46} cy={16 + r * 46} r="1" fill={LINE} />
            )),
          )}
        </g>

        <motion.g variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} transition={{ duration: 0.5 }}>
          <Float dx={10} dy={-8} duration={2.6}>
            <ZigzagChart x={40} y={40} />
          </Float>
          <Float dx={-8} dy={6} duration={3.1} delay={0.3}>
            <EqBars x={40} y={120} />
          </Float>
          <Float dx={7} dy={9} duration={2.2} delay={0.6}>
            <DashedCircle x={210} y={70} r={26} />
          </Float>
        </motion.g>

        <motion.g variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} transition={{ duration: 0.5 }}>
          <Float dx={-9} dy={7} duration={2.8} delay={0.15}>
            <OverlapCircles x={330} y={70} />
          </Float>
        </motion.g>

        <motion.g variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} transition={{ duration: 0.5 }}>
          <Float dx={8} dy={-6} duration={2.4} delay={0.4}>
            <OverlapCircles x={700} y={70} />
          </Float>
          <Float dx={-10} dy={8} duration={3.4} delay={0.1}>
            <MiniScatter x={720} y={110} />
          </Float>
        </motion.g>

        <motion.g variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }} transition={{ duration: 0.5 }}>
          <Float dx={9} dy={-7} duration={2.9} delay={0.25}>
            <NumberedRows x={40} y={260} />
          </Float>
        </motion.g>

        <motion.g variants={{ hidden: { opacity: 0, x: 10 }, show: { opacity: 1, x: 0 } }} transition={{ duration: 0.5 }}>
          <Float dx={-7} dy={8} duration={2.5} delay={0.5}>
            <SquareGrid x={700} y={250} />
          </Float>
          <Float dx={8} dy={-9} duration={3.2} delay={0.2}>
            <EqBars x={700} y={300} heights={[16, 8, 20, 10, 24, 12, 18]} />
          </Float>
        </motion.g>

        <motion.g variants={{ hidden: { opacity: 0, y: -10 }, show: { opacity: 1, y: 0 } }} transition={{ duration: 0.5 }}>
          <Float dx={-8} dy={-7} duration={2.7} delay={0.35}>
            <RadarRings x={100} y={460} />
          </Float>
          <Float dx={9} dy={6} duration={3.0} delay={0.55}>
            <DiamondRow x={40} y={540} />
          </Float>
        </motion.g>

        <motion.g variants={{ hidden: { opacity: 0, y: -10 }, show: { opacity: 1, y: 0 } }} transition={{ duration: 0.5 }}>
          <Float dx={7} dy={-8} duration={2.3} delay={0.45}>
            <RadarRings x={780} y={480} sizes={[6, 12, 18]} />
          </Float>
          <Float dx={-9} dy={7} duration={3.3} delay={0.1}>
            <NumberedRows x={660} y={430} count={2} />
          </Float>
          <Float dx={8} dy={8} duration={2.6} delay={0.3}>
            <SquareGrid x={660} y={500} rows={1} cols={3} filled={[0]} />
          </Float>
        </motion.g>

        <motion.g variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } }} transition={{ duration: 0.6 }}>
          <Float dx={-10} dy={-6} duration={2.9} delay={0.2}>
            <DiamondRow x={370} y={500} count={4} />
          </Float>
        </motion.g>

        <motion.g
          variants={{ hidden: { opacity: 0, scale: 0.85 }, show: { opacity: 1, scale: 1 } }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <Float dx={6} dy={-6} duration={3.6} delay={0.2}>
            <HexCore cx={450} cy={320} />
          </Float>
        </motion.g>
      </svg>
    </motion.div>
  );
}
