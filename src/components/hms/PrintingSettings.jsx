"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "./api";

// Settings › Printing — when to print, plus the two live designers (registration
// slip and bill / invoice). Works the same for a hospital, clinic, pharmacy or lab.
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

  const btn = "rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50";
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold">Printing</p>
      <p className="text-xs text-slate-500">Registration slip (parcha) and bill / invoice. Header, address and logo come from Branding.</p>
      <div className="mt-3 space-y-4 text-sm">
        <div className="space-y-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.slip.enabled} onChange={(e) => setSlip("enabled", e.target.checked)} /> Print a slip when a patient is registered</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.slip.autoPrint} onChange={(e) => setSlip("autoPrint", e.target.checked)} /> Open the print window automatically after registering</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.invoice.showGstin} onChange={(e) => setInv("showGstin", e.target.checked)} /> Show GSTIN on the bill</label>
        </div>
        <label className="block text-xs"><span className="block text-slate-500">Footer line for the slip (optional)</span>
          <input value={s.slip.footer} onChange={(e) => setSlip("footer", e.target.value)} placeholder="e.g. Valid for 7 days · Timings 9am–8pm" className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/admin/print-designer?doc=slip" className={btn}>Design registration slip (parcha)</Link>
          <Link href="/dashboard/admin/print-designer?doc=invoice" className={btn}>Design bill / invoice</Link>
          <span className="text-xs text-slate-500">Drag every text to place it, pick a ready-made style, print a test.</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={save} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">Save printing settings</button>
          {msg && <span className="text-sm text-emerald-700">{msg}</span>}
        </div>
      </div>
    </section>
  );
}
