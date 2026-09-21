"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "./api";
import LayoutRender from "./LayoutRender";
import { PAPER_SIZE, presetLayout, rescaleLayout, T, LINE } from "@/lib/printLayout";
import { SAMPLE_SLIP, SAMPLE_INVOICE, SAMPLE_ITEMS, SAMPLE_TOTALS } from "@/lib/printSample";

const PX_PER_MM = 3.7795;
const newId = () => `d${Math.random().toString(36).slice(2, 9)}`;
const input = "w-full rounded-md border border-slate-300 px-2 py-1 text-sm";

// Live print designer: drag any piece of the slip / bill, edit it on the right,
// pick a ready-made style, save. The canvas is the same renderer the printer uses.
export default function PrintDesigner({ doc }) {
  const [d, setD] = useState(null);
  const [layout, setLayout] = useState(null);
  const [sel, setSel] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const drag = useRef(null);
  const layoutRef = useRef(null);
  useEffect(() => { layoutRef.current = layout; });

  useEffect(() => {
    apiGet("/api/admin/print-settings").then((r) => { setD(r); setLayout(r.settings[doc].layout); }).catch((e) => setMsg(e.message));
  }, [doc]);

  const change = useCallback((fn) => { setLayout((l) => fn(l)); setDirty(true); }, []);
  const patch = useCallback((id, p) => change((l) => ({ ...l, elements: l.elements.map((e) => (e.id === id ? { ...e, ...p } : e)) })), [change]);

  function onDown(ev, el) {
    ev.stopPropagation();
    setSel(el.id);
    drag.current = { id: el.id, sx: ev.clientX, sy: ev.clientY, ox: el.x, oy: el.y, moved: false };
  }
  useEffect(() => {
    const move = (ev) => {
      const g = drag.current;
      if (!g) return;
      const k = PX_PER_MM * zoom;
      const nx = Math.round((g.ox + (ev.clientX - g.sx) / k) * 2) / 2;
      const ny = Math.round((g.oy + (ev.clientY - g.sy) / k) * 2) / 2;
      g.moved = true;
      patch(g.id, { x: nx, y: ny });
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [zoom, patch]);

  useEffect(() => {
    const key = (ev) => {
      if (!sel || /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      const step = ev.shiftKey ? 5 : 0.5;
      const m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
      if (m) {
        ev.preventDefault();
        const e = layoutRef.current.elements.find((x) => x.id === sel);
        if (e) patch(sel, { x: e.x + m[0], y: e.y + m[1] });
      } else if (ev.key === "Delete" || ev.key === "Backspace") {
        change((l) => ({ ...l, elements: l.elements.filter((x) => x.id !== sel) }));
        setSel(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [sel, patch, change]);

  if (!d || !layout) return <p className="p-4 text-sm text-slate-400">{msg || "Loading…"}</p>;

  const isInv = doc === "invoice";
  const el = layout.elements.find((e) => e.id === sel);
  const tokens = d.tokens[doc];
  const data = { facility: d.branding.name || "Your Facility", address: d.branding.address || "Address line", phone: d.branding.phone || "Phone", gstin: "22AAAAA0000A1Z5", footer: "Thank you — get well soon", ...(isInv ? SAMPLE_INVOICE : SAMPLE_SLIP) };

  const add = (o) => { const e = o; change((l) => ({ ...l, elements: [...l.elements, e] })); setSel(e.id); };
  const dup = () => el && add({ ...el, id: newId(), x: el.x + 4, y: el.y + 4 });
  const remove = () => { change((l) => ({ ...l, elements: l.elements.filter((x) => x.id !== sel) })); setSel(null); };

  function applyPreset(key) {
    if (!key) return;
    if (dirty && !confirm("Replace the current design with this style?")) return;
    setLayout(presetLayout(doc, key)); setSel(null); setDirty(true);
  }
  function switchPaper(paper) { change((l) => rescaleLayout(l, paper)); }

  async function save() {
    setMsg("");
    const s = d.settings;
    const next = { ...s, [doc]: { ...s[doc], paper: layout.paper, layout } };
    try {
      const r = await apiSend("/api/admin/print-settings", "PUT", next);
      setD({ ...d, settings: r.settings });
      setDirty(false);
      setMsg("Saved.");
    } catch (e) { setMsg(`Could not save (${e.message}).`); }
  }

  const size = PAPER_SIZE[layout.paper];
  const Num = ({ label, k, min, max, step = 1 }) => (
    <label className="text-xs"><span className="block text-slate-500">{label}</span>
      <input type="number" min={min} max={max} step={step} value={el[k] ?? 0} onChange={(e) => patch(el.id, { [k]: Number(e.target.value) })} className={input} />
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/dashboard/admin/settings" className="text-xs text-slate-500 hover:underline">← Settings</Link>
          <h1 className="text-lg font-semibold">{isInv ? "Design bill / invoice" : "Design registration slip (parcha)"}</h1>
          <p className="text-xs text-slate-500">Drag anything to move it. Arrow keys nudge (Shift = bigger), Delete removes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/dashboard/admin/print-designer?doc=${isInv ? "slip" : "invoice"}`} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">Switch to {isInv ? "slip" : "bill"}</Link>
          <a href={`/print/sample/${doc}`} target="_blank" rel="noreferrer" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">Test print (saved)</a>
          <button onClick={save} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">Save design</button>
          {msg && <span className="text-xs text-emerald-700">{msg}</span>}
          {dirty && !msg && <span className="text-xs text-amber-600">Unsaved changes</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <label className="text-xs"><span className="block text-slate-500">Ready-made style</span>
          <select value="" onChange={(e) => applyPreset(e.target.value)} className={input}>
            <option value="">Choose a style…</option>
            {d.presets[doc].map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className="block text-slate-500">Paper</span>
          <select value={layout.paper} onChange={(e) => switchPaper(e.target.value)} className={input}>
            {d.papers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <div className="flex gap-1.5">
          <button onClick={() => add(T({ x: 10, y: 10, w: 60, text: "New text", fontSize: 10 }))} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">+ Text</button>
          <button onClick={() => add(LINE({ x: 8, y: 20, w: Math.min(100, size.w - 16) }))} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">+ Line</button>
          <button onClick={() => add(T({ x: 10, y: 10, w: 50, h: 14, text: "Box", fontSize: 10, bg: "#e5e7eb", padding: 2 }))} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">+ Box</button>
        </div>
        <label className="text-xs"><span className="block text-slate-500">Zoom</span>
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className={input}>
            {[0.5, 0.75, 1, 1.25, 1.5].map((z) => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <div className="max-h-[75vh] overflow-auto rounded-lg border border-dashed border-slate-300 bg-slate-200 p-4" onPointerDown={() => setSel(null)}>
          <div style={{ width: size.w * PX_PER_MM * zoom, height: layout.h * PX_PER_MM * zoom, margin: "0 auto" }}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: `${size.w}mm`, boxShadow: "0 1px 6px rgba(0,0,0,.25)" }}>
              <LayoutRender layout={layout} data={data} items={isInv ? SAMPLE_ITEMS : null} totals={SAMPLE_TOTALS} logo={d.branding.logo} selectedId={sel} onPointerDownEl={onDown} showGuides />
            </div>
          </div>
        </div>

        <aside className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          {!el ? (
            <p className="text-xs text-slate-500">Click any piece on the paper to edit it. Or drag it where you want.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="font-semibold capitalize">{el.type === "text" && el.bg ? "Box / text" : el.type}</p>
                <div className="flex gap-1.5">
                  <button onClick={dup} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Duplicate</button>
                  <button onClick={remove} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50">Delete</button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={el.visible !== false} onChange={(e) => patch(el.id, { visible: e.target.checked })} /> Show on print</label>
              {el.type === "text" && (
                <>
                  <label className="text-xs"><span className="block text-slate-500">Text</span>
                    <textarea rows={3} value={el.text} onChange={(e) => patch(el.id, { text: e.target.value })} className={input} />
                  </label>
                  <label className="text-xs"><span className="block text-slate-500">Insert a value</span>
                    <select value="" onChange={(e) => e.target.value && patch(el.id, { text: `${el.text}{${e.target.value}}` })} className={input}>
                      <option value="">Add field…</option>
                      {tokens.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {Num({ label: "Font size (pt)", k: "fontSize", min: 5, max: 72 })}
                    <label className="text-xs"><span className="block text-slate-500">Align</span>
                      <select value={el.align} onChange={(e) => patch(el.id, { align: e.target.value })} className={input}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>
                    </label>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!el.bold} onChange={(e) => patch(el.id, { bold: e.target.checked })} /> Bold</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!el.italic} onChange={(e) => patch(el.id, { italic: e.target.checked })} /> Italic</label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs"><span className="block text-slate-500">Text colour</span><input type="color" value={el.color || "#111111"} onChange={(e) => patch(el.id, { color: e.target.value })} className="h-8 w-full" /></label>
                    <label className="text-xs"><span className="block text-slate-500">Background</span>
                      <div className="flex gap-1"><input type="color" value={el.bg || "#ffffff"} onChange={(e) => patch(el.id, { bg: e.target.value })} className="h-8 w-full" /><button onClick={() => patch(el.id, { bg: "" })} className="rounded border border-slate-300 px-1.5 text-xs">✕</button></div>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">{Num({ label: "Height (mm, 0 = auto)", k: "h", min: 0 })}{Num({ label: "Padding (mm)", k: "padding", min: 0, max: 20 })}</div>
                </>
              )}
              {el.type === "line" && (
                <div className="grid grid-cols-2 gap-2">
                  {Num({ label: "Thickness (mm)", k: "thickness", min: 0.1, max: 3, step: 0.1 })}
                  <label className="text-xs"><span className="block text-slate-500">Colour</span><input type="color" value={el.color || "#111111"} onChange={(e) => patch(el.id, { color: e.target.value })} className="h-8 w-full" /></label>
                </div>
              )}
              {el.type === "logo" && <div className="grid grid-cols-2 gap-2">{Num({ label: "Height (mm)", k: "h", min: 1 })}<p className="text-xs text-slate-500">Logo comes from Branding.</p></div>}
              {el.type === "table" && (
                <>
                  {Num({ label: "Font size (pt)", k: "fontSize", min: 5, max: 20 })}
                  <div className="flex flex-wrap gap-3 text-xs">
                    {[["qty", "Qty"], ["unit", "Unit price"], ["amount", "Amount"]].map(([k, l]) => (
                      <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={el.cols[k]} onChange={(e) => patch(el.id, { cols: { ...el.cols, [k]: e.target.checked } })} /> {l}</label>
                    ))}
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={el.totals} onChange={(e) => patch(el.id, { totals: e.target.checked })} /> Totals</label>
                  </div>
                  <label className="text-xs"><span className="block text-slate-500">Header background</span>
                    <div className="flex gap-1"><input type="color" value={el.headerBg || "#ffffff"} onChange={(e) => patch(el.id, { headerBg: e.target.value })} className="h-8 w-full" /><button onClick={() => patch(el.id, { headerBg: "" })} className="rounded border border-slate-300 px-1.5 text-xs">✕</button></div>
                  </label>
                </>
              )}
              <div className="grid grid-cols-3 gap-2 border-t border-slate-200 pt-2">
                {Num({ label: "X (mm)", k: "x", step: 0.5 })}
                {Num({ label: "Y (mm)", k: "y", step: 0.5 })}
                {Num({ label: "Width (mm)", k: "w", min: 1 })}
              </div>
            </>
          )}
        </aside>
      </div>
      <p className="text-xs text-slate-400">Long bills: the items table grows downward and is not split across pages — keep footer pieces well below it. Prescription and lab-report printing are not part of this designer.</p>
    </div>
  );
}
