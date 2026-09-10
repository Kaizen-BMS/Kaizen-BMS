"use client";

/**
 * Kaizen BMS — abstract SVG graphic language.
 * Small, composable primitives (circles, orbits, nodes, lines, crosshairs,
 * data points) that every section-level graphic is built from. Nothing here
 * is a stock icon — every shape is authored for this system.
 */

export const ACCENT = "#08DCDC";
export const ACCENT_2 = "#6E5BFF";
// Theme-aware — these read the same custom properties the rest of the
// site themes through, so any primitive using the defaults (Crosshair,
// NodeNetwork, OrbitRing, CornerBrackets) follows dark mode for free.
export const INK = "var(--kbms-ink)";
export const LINE = "var(--kbms-line)";

/** Large soft organic blob used behind hero / CTA typography. Morphs slowly via CSS. */
export function CyanBlob({ className = "", opacity = 0.9, id = "kbms-blob" }) {
  return (
    <svg
      viewBox="0 0 600 600"
      className={className}
      style={{ opacity }}
      aria-hidden="true"
    >
      <path
        className="kbms-morph"
        fill={ACCENT}
        d="M431,320Q420,440,300,462Q180,484,110,390Q40,296,104,196Q168,96,290,92Q412,88,452,204Q492,320,431,320Z"
      />
    </svg>
  );
}

/** Thin circular orbit ring, optionally carrying a node that travels along it. */
export function OrbitRing({
  radius = 140,
  strokeWidth = 1,
  color = LINE,
  dashed = false,
  className = "",
}) {
  const size = radius * 2 + strokeWidth * 2;
  const c = size / 2;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <circle
        cx={c}
        cy={c}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashed ? "2 8" : undefined}
      />
    </svg>
  );
}

export function NodeDot({ r = 4, color = ACCENT, className = "" }) {
  return (
    <svg width={r * 2 + 4} height={r * 2 + 4} className={className} aria-hidden="true">
      <circle cx={r + 2} cy={r + 2} r={r} fill={color} />
    </svg>
  );
}

export function Crosshair({ size = 20, color = INK, strokeWidth = 1, className = "" }) {
  const c = size / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className={className} aria-hidden="true">
      <line x1={c} y1={0} x2={c} y2={size} stroke={color} strokeWidth={strokeWidth} opacity={0.5} />
      <line x1={0} y1={c} x2={size} y2={c} stroke={color} strokeWidth={strokeWidth} opacity={0.5} />
      <circle cx={c} cy={c} r={2} fill={color} />
    </svg>
  );
}

/** Diagonal connecting line with a small arrowhead — "flow" / "growth" glyph. */
export function ArrowGlyph({ length = 60, color = INK, className = "" }) {
  return (
    <svg width={length} height={length * 0.6} viewBox={`0 0 ${length} ${length * 0.6}`} className={className} aria-hidden="true">
      <line x1={2} y1={length * 0.55} x2={length - 10} y2={6} stroke={color} strokeWidth={1} />
      <polyline points={`${length - 20},4 ${length - 4},4 ${length - 4},20`} fill="none" stroke={color} strokeWidth={1} />
    </svg>
  );
}

/** Sparse grid of small data-point dots — used as quiet section texture. */
export function DataPoints({ rows = 4, cols = 6, gap = 22, color = LINE, className = "" }) {
  const w = cols * gap;
  const h = rows * gap;
  const dots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push(
        <circle key={`${r}-${c}`} cx={c * gap + gap / 2} cy={r * gap + gap / 2} r={1.4} fill={color} />
      );
    }
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true">
      {dots}
    </svg>
  );
}

/** Node-and-line network — "systems + connection" glyph, used across sections. */
export function NodeNetwork({ className = "", color = INK, accent = ACCENT, size = 220 }) {
  const pts = [
    [30, 40], [140, 20], [200, 90], [110, 120], [40, 160], [170, 190],
  ];
  const edges = [[0, 1], [1, 2], [1, 3], [3, 0], [3, 4], [3, 5], [2, 5]];
  return (
    <svg viewBox="0 0 220 220" width={size} height={size} className={className} aria-hidden="true">
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]}
          stroke={color} strokeWidth={0.75} opacity={0.35}
        />
      ))}
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 3 ? 4 : 2.5} fill={i === 3 ? accent : color} opacity={i === 3 ? 1 : 0.6} />
      ))}
    </svg>
  );
}

/** Corner bracket — editorial framing device for graphics / images. */
export function CornerBrackets({ className = "", color = LINE, size = 28 }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {[[0, 0, 1, 1], [100, 0, -1, 1], [0, 100, 1, -1], [100, 100, -1, -1]].map(([x, y, dx, dy], i) => (
        <path
          key={i}
          d={`M${x} ${y + dy * size} V${y} H${x + dx * size}`}
          fill="none"
          stroke={color}
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}
