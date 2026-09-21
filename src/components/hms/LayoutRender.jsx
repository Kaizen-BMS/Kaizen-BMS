import { PAPER_SIZE, resolveText } from "@/lib/printLayout";

// Draws a print layout: a paper with positioned pieces. Used by the real
// print pages and by the designer (which passes pointer handlers so pieces can
// be dragged) — so the designer shows exactly what prints.
export default function LayoutRender({ layout, data, items, totals, logo, selectedId, onPointerDownEl, showGuides }) {
  const size = PAPER_SIZE[layout.paper];
  const table = layout.elements.find((e) => e.type === "table" && e.visible !== false);
  const below = layout.elements.filter((e) => e.belowTable && e.visible !== false && table);
  const money = (n) => `${data.currency || "₹"}${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const wrapProps = (e) => ({
    "data-el": e.id,
    onPointerDown: onPointerDownEl ? (ev) => onPointerDownEl(ev, e) : undefined,
    style: onPointerDownEl ? { cursor: "move", touchAction: "none" } : undefined,
  });
  const outline = (e) => (selectedId === e.id ? { outline: "1.5px solid #2563eb", outlineOffset: "1px" } : showGuides ? { outline: "1px dashed rgba(148,163,184,.6)" } : {});

  function renderText(e, rel) {
    return (
      <div
        key={e.id}
        {...wrapProps(e)}
        style={{
          ...wrapProps(e).style,
          position: "absolute",
          left: `${rel ? e.x - rel.x : e.x}mm`,
          top: rel ? `calc(100% + ${e.y}mm)` : `${e.y}mm`,
          width: `${e.w}mm`,
          height: e.h ? `${e.h}mm` : undefined,
          fontSize: `${e.fontSize}pt`,
          fontWeight: e.bold ? 700 : 400,
          fontStyle: e.italic ? "italic" : "normal",
          textAlign: e.align,
          color: e.color,
          background: e.bg || undefined,
          padding: e.padding ? `${e.padding}mm` : undefined,
          whiteSpace: "pre-wrap",
          lineHeight: 1.25,
          boxSizing: "border-box",
          overflow: "hidden",
          ...outline(e),
        }}
      >
        {resolveText(e.text, data) || (onPointerDownEl ? <span style={{ opacity: 0.35 }}>(empty)</span> : null)}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: `${size.w}mm`, height: `${layout.h}mm`, background: "#fff", color: "#111", fontFamily: "Arial, Helvetica, sans-serif", overflow: "hidden" }}>
      {layout.elements.filter((e) => e.visible !== false && !e.belowTable).map((e) => {
        if (e.type === "text") return renderText(e);
        if (e.type === "line") {
          return <div key={e.id} {...wrapProps(e)} style={{ ...wrapProps(e).style, position: "absolute", left: `${e.x}mm`, top: `${e.y}mm`, width: `${e.w}mm`, height: `${Math.max(e.thickness || 0.4, onPointerDownEl ? 1.2 : 0)}mm`, background: "transparent", ...outline(e) }}><div style={{ marginTop: "0", height: `${e.thickness || 0.4}mm`, background: e.color }} /></div>;
        }
        if (e.type === "logo") {
          return (
            <div key={e.id} {...wrapProps(e)} style={{ ...wrapProps(e).style, position: "absolute", left: `${e.x}mm`, top: `${e.y}mm`, width: `${e.w}mm`, height: `${e.h}mm`, ...outline(e) }}>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "left top" }} />
              ) : onPointerDownEl ? (
                <div style={{ width: "100%", height: "100%", border: "1px dashed #94a3b8", color: "#94a3b8", fontSize: "8pt", display: "grid", placeItems: "center" }}>Logo</div>
              ) : null}
            </div>
          );
        }
        // items table
        const rows = items || [];
        const t = totals || {};
        return (
          <div key={e.id} {...wrapProps(e)} style={{ ...wrapProps(e).style, position: "absolute", left: `${e.x}mm`, top: `${e.y}mm`, width: `${e.w}mm`, fontSize: `${e.fontSize}pt`, color: e.color, lineHeight: 1.3, ...outline(e) }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: e.headerBg || undefined, color: e.headerColor, borderBottom: "0.4mm solid #111" }}>
                  <th style={{ textAlign: "left", padding: "1.2mm 1mm", fontWeight: 700 }}>Description</th>
                  {e.cols.qty && <th style={{ textAlign: "right", padding: "1.2mm 1mm", fontWeight: 700 }}>Qty</th>}
                  {e.cols.unit && <th style={{ textAlign: "right", padding: "1.2mm 1mm", fontWeight: 700 }}>Unit price</th>}
                  {e.cols.amount && <th style={{ textAlign: "right", padding: "1.2mm 1mm", fontWeight: 700 }}>Amount</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "0.2mm solid #d1d5db" }}>
                    <td style={{ padding: "1.3mm 1mm" }}>{r.description}</td>
                    {e.cols.qty && <td style={{ padding: "1.3mm 1mm", textAlign: "right" }}>{r.qty}</td>}
                    {e.cols.unit && <td style={{ padding: "1.3mm 1mm", textAlign: "right" }}>{money(r.unit)}</td>}
                    {e.cols.amount && <td style={{ padding: "1.3mm 1mm", textAlign: "right" }}>{money(r.amount)}</td>}
                  </tr>
                ))}
              </tbody>
              {e.totals && (
                <tfoot>
                  {[["Subtotal", t.subtotal, false], ["Discount", t.discount ? -t.discount : null, false], ["Total", t.total, true], ["Paid", t.paid, false], ["Balance due", t.balance, true]].map(([label, v, strong]) =>
                    v === null || v === undefined || (label === "Paid" && !v) ? null : (
                      <tr key={label} style={{ borderTop: label === "Total" ? "0.4mm solid #111" : undefined }}>
                        <td colSpan={1 + (e.cols.qty ? 1 : 0) + (e.cols.unit ? 1 : 0)} style={{ padding: "1mm", textAlign: "right", fontWeight: strong ? 700 : 400 }}>{label}</td>
                        <td style={{ padding: "1mm", textAlign: "right", fontWeight: strong ? 700 : 400 }}>{v < 0 ? "-" : ""}{money(Math.abs(v))}</td>
                      </tr>
                    ),
                  )}
                </tfoot>
              )}
            </table>
            {below.map((b) => renderText(b, table))}
          </div>
        );
      })}
    </div>
  );
}
