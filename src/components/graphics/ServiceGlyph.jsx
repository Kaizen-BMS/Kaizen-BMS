"use client";

/**
 * Procedurally arranged node-cluster glyph — a distinct abstract mark per
 * service row, generated from the shared primitive language (nodes, orbit
 * rings, connecting lines) rather than a literal icon-library pictogram.
 */
// Fixed precision keeps the server- and client-rendered markup byte-identical —
// Math.cos/sin can differ in their last float digit between runtimes, which
// otherwise trips a React hydration mismatch on every row.
const round = (n) => Math.round(n * 100) / 100;

export default function ServiceGlyph({ index = 0, size = 160 }) {
  const seed = index * 47;
  const nodeCount = 5 + (index % 3);
  const c = size / 2;
  const baseR = size * 0.32;

  const nodes = Array.from({ length: nodeCount }, (_, i) => {
    const angle = (Math.PI * 2 * i) / nodeCount + seed * 0.11;
    const r = baseR * (0.6 + 0.4 * Math.abs(Math.sin(seed + i * 1.7)));
    return {
      x: round(c + Math.cos(angle) * r),
      y: round(c + Math.sin(angle) * r),
      big: i === index % nodeCount,
    };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <circle cx={c} cy={c} r={baseR + 14} fill="none" stroke="var(--kbms-line)" strokeWidth="1" />
      {nodes.map((n, i) => {
        const next = nodes[(i + 1) % nodes.length];
        return (
          <line
            key={`l-${i}`}
            x1={n.x} y1={n.y} x2={next.x} y2={next.y}
            stroke="var(--kbms-ink)" strokeOpacity="0.18" strokeWidth="0.75"
          />
        );
      })}
      <line x1={c} y1={c} x2={nodes[0].x} y2={nodes[0].y} stroke="#08DCDC" strokeOpacity="0.5" strokeWidth="0.75" />
      {nodes.map((n, i) => (
        <circle key={`n-${i}`} cx={n.x} cy={n.y} r={n.big ? 4.5 : 2.4} fill={n.big ? "#08DCDC" : "var(--kbms-ink)"} fillOpacity={n.big ? 1 : 0.55} />
      ))}
      <circle cx={c} cy={c} r={3} fill="var(--kbms-ink)" />
    </svg>
  );
}
