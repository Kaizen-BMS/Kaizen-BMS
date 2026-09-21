"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "./api";
import SlipView from "./SlipView";

const TOGGLES = [
  ["showToken", "Token number"],
  ["showAge", "Age"],
  ["showGender", "Gender"],
  ["showPhone", "Phone"],
  ["showReason", "Reason for visit"],
  ["showDateTime", "Date & time"],
  ["showFee", "Fee paid (if collected)"],
];

// Settings › Printing — choose paper and what the registration slip / bill
// shows, and watch the preview change. Works the same for a hospital, a
// clinic, a pharmacy or a lab.
export default function PrintingSettings() {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiGet("/api/admin/print-settings").then(setD).catch((e) => setMsg(e.message));
  }, []);
  if (!d) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;

  const s = d.settings;
  const setSlip = (k, v) => setD({ ...d, settings: { ...s, slip: { ...s.slip, [k]: v } } });
  const setInv = (k, v) => setD({ ...d, settings: { ...s, invoice: { ...s.invoice, [k]: v } } });

  async function save() {
    setMsg("");
    try {
      await apiSend("/api/admin/print-settings", "PUT", d.settings);
      setMsg("Saved.");
    } catch (e) {
      setMsg(`Could not save (${e.message}).`);
    }
  }

  const sample = { name: "Sample Patient", age: 34, gender: "FEMALE", phone: "98XXXXXX10", token: 12, reason: "Fever since 2 days", when: new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }), fee: 300 };
  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold">Printing</p>
      <p className="text-xs text-slate-500">Registration slip (parcha) and bill / receipt. Your header, address and logo come from Branding.</p>
      <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.slip.enabled} onChange={(e) => setSlip("enabled", e.target.checked)} /> Print a slip when a patient is registered</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.slip.autoPrint} onChange={(e) => setSlip("autoPrint", e.target.checked)} /> Open the print window automatically after registering</label>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="text-xs"><span className="block text-slate-500">Slip paper</span>
              <select value={s.slip.paper} onChange={(e) => setSlip("paper", e.target.value)} className={input}>{d.papers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
            </label>
            <label className="text-xs"><span className="block text-slate-500">Slip title</span><input value={s.slip.title} onChange={(e) => setSlip("title", e.target.value)} className={input} /></label>
          </div>
          <div>
            <p className="text-xs text-slate-500">Show on the slip</p>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {TOGGLES.map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={s.slip[k]} onChange={(e) => setSlip(k, e.target.checked)} /> {l}</label>)}
            </div>
          </div>
          <label className="block text-xs"><span className="block text-slate-500">Footer line (optional)</span><input value={s.slip.footer} onChange={(e) => setSlip("footer", e.target.value)} placeholder="e.g. Valid for 7 days · Timings 9am–8pm" className={`${input} w-full`} /></label>
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3">
            <label className="text-xs"><span className="block text-slate-500">Bill / receipt paper</span>
              <select value={s.invoice.paper} onChange={(e) => setInv("paper", e.target.value)} className={input}>{d.papers.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
            </label>
            <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={s.invoice.showGstin} onChange={(e) => setInv("showGstin", e.target.checked)} /> Show GSTIN on the bill</label>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">Save printing settings</button>
            {msg && <span className="text-sm text-emerald-700">{msg}</span>}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">Preview ({d.papers.find((p) => p.key === s.slip.paper)?.label})</p>
          <div className="max-h-[32rem] overflow-auto rounded-md border border-dashed border-slate-300 bg-slate-100 p-2">
            <div className="origin-top scale-[0.85]"><SlipView settings={s} branding={d.branding} data={sample} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
