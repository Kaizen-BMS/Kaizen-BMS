"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

const inp = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";

// Test sets ("CBC Panel", "Liver Function Test"): a name plus the component
// tests it contains. A doctor can order the whole set in one click.
export function LabPanels({ canManage }) {
  const [panels, setPanels] = useState(null);
  const [tests, setTests] = useState([]);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ name: "", sampleType: "", components: "" });
  const [editing, setEditing] = useState(null); // panel id
  const [busy, setBusy] = useState(false);

  const load = () => apiGet("/api/lab/panels").then((d) => setPanels(d.panels));
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    apiGet("/api/lab/tests").then((d) => setTests(d.tests)).catch(() => {});
  }, []);

  // One component per line (or comma-separated); a name that matches a priced test of this lab is linked to it.
  function parseComponents(text) {
    const byName = new Map(tests.map((t) => [t.name.toLowerCase(), t]));
    return text
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((name) => {
        const hit = byName.get(name.toLowerCase());
        return hit ? { name: hit.name, serviceId: hit.serviceId } : { name };
      });
  }

  async function save(e) {
    e.preventDefault();
    const list = parseComponents(f.components);
    if (!f.name.trim() || list.length === 0) return;
    setBusy(true);
    setMsg("");
    try {
      if (editing) await apiSend(`/api/lab/panels/${editing}`, "PATCH", { name: f.name, sampleType: f.sampleType, tests: list });
      else await apiSend("/api/lab/panels", "POST", { name: f.name, sampleType: f.sampleType, tests: list });
      setF({ name: "", sampleType: "", components: "" });
      setEditing(null);
      await load();
    } catch (err) {
      setMsg(err.message === "panel_already_exists" ? "A test set with this name already exists." : `Could not save (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p) {
    try {
      await apiSend(`/api/lab/panels/${p.id}`, "PATCH", { active: !p.active });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold">Test sets</p>
        <p className="text-xs text-slate-400">Group several tests into one orderable set, e.g. CBC = Hemoglobin, RBC, WBC, Platelets…</p>
      </div>
      {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
      {canManage && (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">Test set name
            <input required placeholder="CBC Panel" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${inp} mt-1`} />
          </label>
          <label className="text-xs font-medium text-slate-600">Sample type
            <input placeholder="Blood (EDTA)" value={f.sampleType} onChange={(e) => setF({ ...f, sampleType: e.target.value })} className={`${inp} mt-1`} />
          </label>
          <label className="text-xs font-medium text-slate-600 sm:col-span-2">Tests in this set
            <textarea required rows={3} placeholder={"Hemoglobin\nRBC\nWBC\nPlatelets"} value={f.components} onChange={(e) => setF({ ...f, components: e.target.value })} className={`${inp} mt-1`} />
            <span className="mt-0.5 block text-[11px] font-normal text-slate-400">One per line. Names matching a test you offer are linked to its price.</span>
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={busy} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{editing ? "Save changes" : "Add test set"}</button>
            {editing && <button type="button" onClick={() => { setEditing(null); setF({ name: "", sampleType: "", components: "" }); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Cancel</button>}
          </div>
        </form>
      )}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {panels === null && <p className="px-3 py-4 text-sm text-slate-400">Loading…</p>}
        {panels?.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">No test sets yet.</p>}
        {panels?.map((p) => (
          <div key={p.id} className={`flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm ${p.active ? "" : "opacity-50"}`}>
            <div>
              <p className="font-medium">{p.name}{p.sampleType ? <span className="ml-2 text-xs font-normal text-slate-400">{p.sampleType}</span> : null}</p>
              <p className="text-xs text-slate-500">{p.tests.map((t) => t.name).join(", ")}</p>
            </div>
            {canManage && (
              <div className="flex gap-1">
                <button onClick={() => { setEditing(p.id); setF({ name: p.name, sampleType: p.sampleType || "", components: p.tests.map((t) => t.name).join("\n") }); }} className="rounded-md px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100">Edit</button>
                <button onClick={() => toggle(p)} className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100">{p.active ? "Switch off" : "Switch on"}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
