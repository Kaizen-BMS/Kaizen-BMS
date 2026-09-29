"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "./api";
import LayoutRender from "./LayoutRender";
import { PAPER_SIZE, presetLayout, rescaleLayout, T, LINE, LOGO, PHOTO, SIGNATURE } from "@/lib/printLayout";
import { SAMPLE_SLIP, SAMPLE_INVOICE, SAMPLE_STAFF, SAMPLE_ITEMS, SAMPLE_TOTALS } from "@/lib/printSample";

const PX_PER_MM = 3.7795;
const newId = () => `d${Math.random().toString(36).slice(2, 9)}`;
const input = "w-full rounded-md border border-slate-300 px-2 py-1 text-sm";
const DOC_LABEL = { slip: "registration slip (parcha)", invoice: "bill / invoice", staffCard: "staff ID card" };
const HISTORY_LIMIT = 50;

// Live print designer: drag any piece of the slip / bill / staff card, edit
// it on the right, pick a ready-made style, save. The canvas is the same
// renderer the printer uses. Undo/redo is a simple past/future stack of
// whole-layout snapshots -- every change() call records where the layout
// was a moment ago, so any small edit can be stepped back through, not just
// the last one.
export default function PrintDesigner({ doc }) {
  const [d, setD] = useState(null);
  const [layout, setLayout] = useState(null);
  const [sel, setSel] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [presetName, setPresetName] = useState("");
  const drag = useRef(null);
  const layoutRef = useRef(null);
  useEffect(() => { layoutRef.current = layout; });
  const history = useRef({ past: [], future: [] });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const syncHistoryButtons = () => { setCanUndo(history.current.past.length > 0); setCanRedo(history.current.future.length > 0); };

  useEffect(() => {
    apiGet("/api/admin/print-settings").then((r) => { setD(r); setLayout(r.settings[doc].layout); history.current = { past: [], future: [] }; syncHistoryButtons(); }).catch((e) => setMsg(e.message));
  }, [doc]);

  const change = useCallback((fn) => {
    setLayout((l) => {
      const next = fn(l);
      if (next === l) return l;
      history.current.past = [...history.current.past.slice(-(HISTORY_LIMIT - 1)), l];
      history.current.future = [];
      syncHistoryButtons();
      return next;
    });
    setDirty(true);
  }, []);
  const patch = useCallback((id, p) => change((l) => ({ ...l, elements: l.elements.map((e) => (e.id === id ? { ...e, ...p } : e)) })), [change]);
  // A drag fires dozens of position updates a second — recording each one as
  // its own undo step would make Ctrl+Z undo one pixel at a time instead of
  // the whole move. This applies a patch WITHOUT touching history; the drag
  // start/end handlers below record exactly one history entry per drag.
  const patchSilent = useCallback((id, p) => setLayout((l) => ({ ...l, elements: l.elements.map((e) => (e.id === id ? { ...e, ...p } : e)) })), []);

  function undo() {
    const h = history.current;
    if (h.past.length === 0) return;
    const prev = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);
    h.future = [layoutRef.current, ...h.future].slice(0, HISTORY_LIMIT);
    setLayout(prev);
    setDirty(true);
    syncHistoryButtons();
  }
  function redo() {
    const h = history.current;
    if (h.future.length === 0) return;
    const next = h.future[0];
    h.future = h.future.slice(1);
    h.past = [...h.past, layoutRef.current].slice(-HISTORY_LIMIT);
    setLayout(next);
    setDirty(true);
    syncHistoryButtons();
  }
  useEffect(() => {
    const key = (ev) => {
      if (/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") { ev.preventDefault(); ev.shiftKey ? redo() : undo(); }
      else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") { ev.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDown(ev, el) {
    ev.stopPropagation();
    setSel(el.id);
    drag.current = { id: el.id, sx: ev.clientX, sy: ev.clientY, ox: el.x, oy: el.y, moved: false, startLayout: layoutRef.current };
  }
  useEffect(() => {
    const move = (ev) => {
      const g = drag.current;
      if (!g) return;
      const k = PX_PER_MM * zoom;
      const nx = Math.round((g.ox + (ev.clientX - g.sx) / k) * 2) / 2;
      const ny = Math.round((g.oy + (ev.clientY - g.sy) / k) * 2) / 2;
      g.moved = true;
      patchSilent(g.id, { x: nx, y: ny });
      setDirty(true);
    };
    const up = () => {
      const g = drag.current;
      if (g && g.moved && g.startLayout) {
        history.current.past = [...history.current.past.slice(-(HISTORY_LIMIT - 1)), g.startLayout];
        history.current.future = [];
        syncHistoryButtons();
      }
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [zoom, patchSilent]);

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
  const isCard = doc === "staffCard";
  const el = layout.elements.find((e) => e.id === sel);
  const tokens = d.tokens[doc];
  const data = isCard
    ? { facility: d.branding.name || "Your Facility", ...SAMPLE_STAFF }
    : { facility: d.branding.name || "Your Facility", address: d.branding.address || "Address line", phone: d.branding.phone || "Phone", gstin: "22AAAAA0000A1Z5", footer: "Thank you — get well soon", ...(isInv ? SAMPLE_INVOICE : SAMPLE_SLIP) };
  const customPresets = d.settings[doc].customPresets || [];

  const add = (o) => { const e = o; change((l) => ({ ...l, elements: [...l.elements, e] })); setSel(e.id); };
  const dup = () => el && add({ ...el, id: newId(), x: el.x + 4, y: el.y + 4 });
  const remove = () => { change((l) => ({ ...l, elements: l.elements.filter((x) => x.id !== sel) })); setSel(null); };

  function swapLayout(next) {
    history.current.past = [...history.current.past.slice(-(HISTORY_LIMIT - 1)), layoutRef.current];
    history.current.future = [];
    syncHistoryButtons();
    setLayout(next); setSel(null); setDirty(true);
  }
  function applyPreset(key) {
    if (!key) return;
    swapLayout(presetLayout(doc, key));
  }
  function applyCustomPreset(id) {
    const p = customPresets.find((x) => x.id === id);
    if (p) swapLayout(p.layout);
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

  // "Design it, save it, use it later" -- a NAMED snapshot of the current
  // canvas, separate from the one active/live layout above. Saved alongside
  // the active layout in the same print_settings JSON (no new table), so it
  // survives reload and can be reloaded into the canvas any time via
  // applyCustomPreset(), without touching what's currently live until you do.
  async function saveAsTemplate() {
    const name = presetName.trim();
    if (!name) return;
    setMsg("");
    const entry = { id: `c${Date.now().toString(36)}`, name, savedAt: new Date().toISOString(), layout };
    const s = d.settings;
    const nextGroup = { ...s[doc], customPresets: [...customPresets, entry] };
    const next = { ...s, [doc]: nextGroup };
    try {
      const r = await apiSend("/api/admin/print-settings", "PUT", next);
      setD({ ...d, settings: r.settings });
      setPresetName("");
      setMsg(`Saved as "${name}".`);
    } catch (e) { setMsg(`Could not save (${e.message}).`); }
  }
  async function deleteTemplate(id) {
    if (!confirm("Delete this saved design? This can't be undone.")) return;
    setMsg("");
    const s = d.settings;
    const next = { ...s, [doc]: { ...s[doc], customPresets: customPresets.filter((p) => p.id !== id) } };
    try {
      const r = await apiSend("/api/admin/print-settings", "PUT", next);
      setD({ ...d, settings: r.settings });
    } catch (e) { setMsg(`Could not delete (${e.message}).`); }
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
          <h1 className="text-lg font-semibold">Design {DOC_LABEL[doc]}</h1>
          <p className="text-xs text-slate-500">Drag anything to move it. Arrow keys nudge (Shift = bigger), Delete removes, Ctrl+Z undoes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {Object.keys(DOC_LABEL).filter((k) => k !== doc).map((k) => (
            <Link key={k} href={`/dashboard/admin/print-designer?doc=${k}`} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">Switch to {k === "staffCard" ? "staff card" : k === "invoice" ? "bill" : "slip"}</Link>
          ))}
          <a href={doc === "staffCard" ? "/print/sample/staffCard" : `/print/sample/${doc}`} target="_blank" rel="noreferrer" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">Test print (saved)</a>
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
        {customPresets.length > 0 && (
          <label className="text-xs"><span className="block text-slate-500">My saved designs</span>
            <select value="" onChange={(e) => applyCustomPreset(e.target.value)} className={input}>
              <option value="">Choose one…</option>
              {customPresets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs"><span className="block text-slate-500">Paper</span>
          <select value={layout.paper} onChange={(e) => switchPaper(e.target.value)} className={input}>
            {d.papers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <div className="flex gap-1.5">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-40">↶ Undo</button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-40">↷ Redo</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => add(T({ x: 10, y: 10, w: 60, text: "New text", fontSize: 10 }))} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">+ Text</button>
          <button onClick={() => add(LINE({ x: 8, y: 20, w: Math.min(100, size.w - 16) }))} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">+ Line</button>
          <button onClick={() => add(T({ x: 10, y: 10, w: 50, h: 14, text: "Box", fontSize: 10, bg: "#e5e7eb", padding: 2 }))} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">+ Box</button>
          <button onClick={() => add(LOGO({ x: 8, y: 8, w: 20, h: 20 }))} title="Facility logo, from Branding" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">+ Logo</button>
          {isCard && <button onClick={() => add(PHOTO({ x: 8, y: 8, w: 20, h: 24 }))} title="The staff member's own photo" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">+ Photo</button>}
          <button onClick={() => add(SIGNATURE({ x: 10, y: 10, w: 35, h: 15 }))} title="Doctor's / facility's signature, from Branding" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50">+ Signature</button>
        </div>
        <label className="text-xs"><span className="block text-slate-500">Zoom</span>
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className={input}>
            {[0.5, 0.75, 1, 1.25, 1.5].map((z) => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
          </select>
        </label>
        <div className="flex items-end gap-1.5">
          <label className="text-xs"><span className="block text-slate-500">Save this design for later</span>
            <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. Diwali special slip" className={`${input} w-48`} />
          </label>
          <button onClick={saveAsTemplate} disabled={!presetName.trim()} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-40">Save as…</button>
        </div>
      </div>

      {customPresets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
          <span className="text-slate-500">My saved designs:</span>
          {customPresets.map((p) => (
            <span key={p.id} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-2.5 pr-1">
              <button onClick={() => applyCustomPreset(p.id)} className="hover:underline">{p.name}</button>
              <button onClick={() => deleteTemplate(p.id)} title="Delete" className="rounded-full px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">✕</button>
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
        <div className="max-h-[75vh] overflow-auto rounded-lg border border-dashed border-slate-300 bg-slate-200 p-4" onPointerDown={() => setSel(null)}>
          <div style={{ width: size.w * PX_PER_MM * zoom, height: layout.h * PX_PER_MM * zoom, margin: "0 auto" }}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: `${size.w}mm`, boxShadow: "0 1px 6px rgba(0,0,0,.25)" }}>
              <LayoutRender layout={layout} data={data} items={isInv ? SAMPLE_ITEMS : null} totals={SAMPLE_TOTALS} logo={d.branding.logo} signature={d.branding.signature} selectedId={sel} onPointerDownEl={onDown} showGuides />
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
              {el.type === "logo" && <div className="grid grid-cols-2 gap-2">{Num({ label: "Height (mm)", k: "h", min: 1 })}<p className="text-xs text-slate-500">Logo comes from Branding — upload/change it there.</p></div>}
              {el.type === "photo" && <div className="grid grid-cols-2 gap-2">{Num({ label: "Height (mm)", k: "h", min: 1 })}<p className="text-xs text-slate-500">Each person&apos;s own photo, from their staff profile.</p></div>}
              {el.type === "signature" && <div className="grid grid-cols-2 gap-2">{Num({ label: "Height (mm)", k: "h", min: 1 })}<p className="text-xs text-slate-500">The doctor&apos;s (or facility&apos;s) signature — upload it in Branding.</p></div>}
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
      <p className="text-xs text-slate-400">Long bills: the items table grows downward and is not split across pages — keep footer pieces well below it. Prescription and lab-report printing are not part of this designer.{isCard && " Every staff member's card uses this same design, with their own name, ID and photo filled in."}</p>
    </div>
  );
}
