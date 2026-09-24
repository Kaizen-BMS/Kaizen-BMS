"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

const MODALITIES = ["X-Ray", "CT", "MRI", "Ultrasound", "Mammography", "Fluoroscopy", "Other"];
const CONTRAST = { NONE: "No contrast", OPTIONAL: "Contrast optional", REQUIRED: "Contrast required" };
const inp = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
const EMPTY_STUDY = { name: "", modality: "X-Ray", bodyPart: "", price: "", gst: "0", contrastOption: "NONE", preparation: "", turnaroundHours: "" };
const EMPTY_SET = { name: "", modality: "", components: "" };

// The imaging department's own list of studies (priced) and study sets. Same idea as the lab's
// test list: doctors pick from it when ordering, so what they order is what this department offers.
export default function RadiologyCatalog({ canManage }) {
  const [studies, setStudies] = useState(null);
  const [sets, setSets] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sf, setSf] = useState(EMPTY_STUDY);
  const [editingStudy, setEditingStudy] = useState(null);
  const [pf, setPf] = useState(EMPTY_SET);
  const [editingSet, setEditingSet] = useState(null);

  const load = () =>
    Promise.all([apiGet("/api/radiology/tests"), apiGet("/api/radiology/panels")]).then(([a, b]) => {
      setStudies(a.studies);
      setSets(b.sets);
    });
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function saveStudy(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const body = {
      name: sf.name,
      modality: sf.modality,
      bodyPart: sf.bodyPart,
      price: Number(sf.price || 0),
      gst: Number(sf.gst || 0),
      contrastOption: sf.contrastOption,
      preparation: sf.preparation,
    };
    if (sf.turnaroundHours !== "") body.turnaroundHours = Number(sf.turnaroundHours);
    try {
      if (editingStudy) await apiSend(`/api/radiology/tests/${editingStudy}`, "PATCH", body);
      else await apiSend("/api/radiology/tests", "POST", body);
      setSf(EMPTY_STUDY);
      setEditingStudy(null);
      await load();
    } catch (err) {
      setMsg(`Could not save (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleStudy(s) {
    try {
      await apiSend(`/api/radiology/tests/${s.id}`, "PATCH", { active: !s.active });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  // One study per line; a name matching a study of this department links to its price.
  function parseStudies(text) {
    const byName = new Map((studies || []).map((t) => [t.name.toLowerCase(), t]));
    return text
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((name) => {
        const hit = byName.get(name.toLowerCase());
        return hit ? { name: hit.name, serviceId: hit.serviceId } : { name };
      });
  }

  async function saveSet(e) {
    e.preventDefault();
    const list = parseStudies(pf.components);
    if (!pf.name.trim() || list.length === 0) return;
    setBusy(true);
    setMsg("");
    try {
      const body = { name: pf.name, modality: pf.modality, studies: list };
      if (editingSet) await apiSend(`/api/radiology/panels/${editingSet}`, "PATCH", body);
      else await apiSend("/api/radiology/panels", "POST", body);
      setPf(EMPTY_SET);
      setEditingSet(null);
      await load();
    } catch (err) {
      setMsg(err.message === "set_already_exists" ? "A study set with this name already exists." : `Could not save (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSet(p) {
    try {
      await apiSend(`/api/radiology/panels/${p.id}`, "PATCH", { active: !p.active });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="space-y-5">
      {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold">Imaging studies we offer</p>
          <p className="text-xs text-slate-400">Doctors choose from this list when ordering. Add each study with its price and patient preparation.</p>
        </div>
        {canManage && (
          <form onSubmit={saveStudy} className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-slate-600 sm:col-span-2">Study name
              <input required placeholder="CT Abdomen + Pelvis" value={sf.name} onChange={(e) => setSf({ ...sf, name: e.target.value })} className={`${inp} mt-1`} />
            </label>
            <label className="text-xs font-medium text-slate-600">Modality
              <select value={sf.modality} onChange={(e) => setSf({ ...sf, modality: e.target.value })} className={`${inp} mt-1`}>
                {MODALITIES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">Body region
              <input placeholder="Abdomen" value={sf.bodyPart} onChange={(e) => setSf({ ...sf, bodyPart: e.target.value })} className={`${inp} mt-1`} />
            </label>
            <label className="text-xs font-medium text-slate-600">Price (₹)
              <input required type="number" min="0" step="0.01" value={sf.price} onChange={(e) => setSf({ ...sf, price: e.target.value })} className={`${inp} mt-1`} />
            </label>
            <label className="text-xs font-medium text-slate-600">GST %
              <input type="number" min="0" max="28" step="0.01" value={sf.gst} onChange={(e) => setSf({ ...sf, gst: e.target.value })} className={`${inp} mt-1`} />
            </label>
            <label className="text-xs font-medium text-slate-600">Contrast
              <select value={sf.contrastOption} onChange={(e) => setSf({ ...sf, contrastOption: e.target.value })} className={`${inp} mt-1`}>
                {Object.entries(CONTRAST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">Report ready in (hours)
              <input type="number" min="0" value={sf.turnaroundHours} onChange={(e) => setSf({ ...sf, turnaroundHours: e.target.value })} className={`${inp} mt-1`} />
            </label>
            <label className="text-xs font-medium text-slate-600 sm:col-span-3">Patient preparation
              <input placeholder="Fasting 6 hours; full bladder…" value={sf.preparation} onChange={(e) => setSf({ ...sf, preparation: e.target.value })} className={`${inp} mt-1`} />
            </label>
            <div className="flex gap-2 sm:col-span-3">
              <button disabled={busy} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{editingStudy ? "Save changes" : "Add study"}</button>
              {editingStudy && <button type="button" onClick={() => { setEditingStudy(null); setSf(EMPTY_STUDY); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Cancel</button>}
            </div>
          </form>
        )}
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {studies === null && <p className="px-3 py-4 text-sm text-slate-400">Loading…</p>}
          {studies?.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">No studies yet. Doctors can still order from the common list.</p>}
          {studies?.map((s) => (
            <div key={s.id} className={`flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm ${s.active ? "" : "opacity-50"}`}>
              <div>
                <p className="font-medium">{s.name} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{s.modality}</span></p>
                <p className="text-xs text-slate-500">
                  {s.price != null ? `₹${s.price}${s.gst ? ` + ${s.gst}% GST` : ""}` : "No price"} · {CONTRAST[s.contrastOption]}{s.turnaroundHours ? ` · ${s.turnaroundHours}h` : ""}
                  {s.preparation ? ` · ${s.preparation}` : ""}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <button onClick={() => { setEditingStudy(s.id); setSf({ name: s.name, modality: s.modality, bodyPart: s.bodyPart || "", price: String(s.price ?? ""), gst: String(s.gst ?? 0), contrastOption: s.contrastOption, preparation: s.preparation || "", turnaroundHours: s.turnaroundHours != null ? String(s.turnaroundHours) : "" }); }} className="rounded-md px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100">Edit</button>
                  <button onClick={() => toggleStudy(s)} className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100">{s.active ? "Switch off" : "Switch on"}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold">Study sets</p>
          <p className="text-xs text-slate-400">Group studies that are usually ordered together, e.g. Chest X-ray PA + Lateral.</p>
        </div>
        {canManage && (
          <form onSubmit={saveSet} className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">Set name
              <input required placeholder="Trauma series" value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} className={`${inp} mt-1`} />
            </label>
            <label className="text-xs font-medium text-slate-600">Modality (optional)
              <select value={pf.modality} onChange={(e) => setPf({ ...pf, modality: e.target.value })} className={`${inp} mt-1`}>
                <option value="">Mixed</option>
                {MODALITIES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600 sm:col-span-2">Studies in this set
              <textarea required rows={3} placeholder={"Chest PA\nPelvis AP"} value={pf.components} onChange={(e) => setPf({ ...pf, components: e.target.value })} className={`${inp} mt-1`} />
              <span className="mt-0.5 block text-[11px] font-normal text-slate-400">One per line. Names matching a study above are linked to its price.</span>
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button disabled={busy} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{editingSet ? "Save changes" : "Add study set"}</button>
              {editingSet && <button type="button" onClick={() => { setEditingSet(null); setPf(EMPTY_SET); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Cancel</button>}
            </div>
          </form>
        )}
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {sets === null && <p className="px-3 py-4 text-sm text-slate-400">Loading…</p>}
          {sets?.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">No study sets yet.</p>}
          {sets?.map((p) => (
            <div key={p.id} className={`flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm ${p.active ? "" : "opacity-50"}`}>
              <div>
                <p className="font-medium">{p.name}{p.modality ? <span className="ml-2 text-xs font-normal text-slate-400">{p.modality}</span> : null}</p>
                <p className="text-xs text-slate-500">{p.studies.map((t) => t.name).join(", ")}</p>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <button onClick={() => { setEditingSet(p.id); setPf({ name: p.name, modality: p.modality || "", components: p.studies.map((t) => t.name).join("\n") }); }} className="rounded-md px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100">Edit</button>
                  <button onClick={() => toggleSet(p)} className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100">{p.active ? "Switch off" : "Switch on"}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
