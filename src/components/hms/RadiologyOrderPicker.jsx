"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "./api";
import { COMMON_STUDIES, SAFETY_FLAGS } from "@/lib/radiologyCommon";

const inp = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
const lab = "block text-xs font-medium text-slate-600";
const help = "mt-0.5 block text-[11px] font-normal leading-tight text-slate-400";
const RADIATION = new Set(["X-Ray", "CT", "Fluoroscopy", "Mammography"]);

// Doctor's imaging order: pick WHERE it goes (our radiology department), pick the study or a study set,
// then fill the requisition a radiologist needs — clinical question, side, contrast, pregnancy,
// MRI/contrast safety screening, mobility and instructions.
export default function RadiologyOrderPicker({ consultationId, patient, onOrdered, onError }) {
  const [catalog, setCatalog] = useState(undefined); // undefined = loading, null = no department
  const [modality, setModality] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]); // [{ key, name, serviceId?, modality, bodyPart, contrastOption, preparation }]
  const [f, setF] = useState({ indication: "", priority: "ROUTINE", laterality: "NA", contrast: "", pregnancy: "", flags: [], mobility: "WALKING", instructions: "" });
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState([]);

  useEffect(() => {
    apiGet("/api/radiology/order-catalog").then((d) => setCatalog(d.provider)).catch(() => setCatalog(null));
  }, []);

  const studies = useMemo(() => catalog?.studies || [], [catalog]);
  const modalities = useMemo(() => [...new Set([...studies.map((s) => s.modality), ...Object.keys(COMMON_STUDIES)])], [studies]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const sets = (catalog?.sets || []).map((s) => ({ kind: "set", key: `set-${s.id}`, name: s.name, modality: s.modality, studies: s.studies }));
    const list = studies.map((s) => ({ kind: "study", key: `st-${s.id}`, ...s }));
    return [...sets, ...list]
      .filter((r) => (!modality || r.modality === modality) && (!term || r.name.toLowerCase().includes(term) || (r.bodyPart || "").toLowerCase().includes(term)))
      .slice(0, 30);
  }, [catalog, studies, modality, q]);

  const isPicked = (key) => picked.some((p) => p.key === key);
  function addStudy(s) {
    setPicked((xs) => (xs.some((p) => p.key === s.key) ? xs : [...xs, s]));
    if (s.contrastOption === "REQUIRED") setF((x) => ({ ...x, contrast: x.contrast || "WITH" }));
  }
  function toggle(r) {
    if (r.kind === "set") {
      const key = r.key;
      if (isPicked(key)) return setPicked((xs) => xs.filter((p) => p.key !== key));
      // a set expands to its studies, each with its catalogue details when known
      const items = r.studies.map((st) => {
        const hit = studies.find((x) => x.name.toLowerCase() === st.name.toLowerCase());
        return { key: `st-${hit?.id ?? st.name}`, name: st.name, serviceId: hit?.serviceId ?? st.serviceId ?? undefined, modality: hit?.modality || r.modality || "", bodyPart: hit?.bodyPart || "", contrastOption: hit?.contrastOption || "NONE", preparation: hit?.preparation || "", fromSet: r.name };
      });
      return setPicked((xs) => [...xs, ...items.filter((it) => !xs.some((p) => p.key === it.key))]);
    }
    if (isPicked(r.key)) return setPicked((xs) => xs.filter((p) => p.key !== r.key));
    addStudy({ key: r.key, name: r.name, serviceId: r.serviceId, modality: r.modality, bodyPart: r.bodyPart, contrastOption: r.contrastOption, preparation: r.preparation });
  }
  function addCommon(name, mod) {
    addStudy({ key: `c-${name}`, name, modality: mod, bodyPart: "", contrastOption: mod === "CT" || mod === "MRI" ? "OPTIONAL" : "NONE", preparation: "" });
  }

  const mods = new Set(picked.map((p) => p.modality).filter(Boolean));
  const needsSafety = mods.has("MRI") || mods.has("CT") || f.contrast === "WITH";
  const radiation = [...mods].some((m) => RADIATION.has(m));
  const female = String(patient?.gender || "").toUpperCase() === "FEMALE";
  const age = Number(patient?.age);
  const askPregnancy = (female || !patient?.gender) && (!Number.isFinite(age) || (age >= 10 && age <= 55));
  const pregnancyMissing = askPregnancy && female && radiation && !f.pregnancy;
  const canSend = (picked.length > 0 || custom.trim()) && f.indication.trim().length >= 3 && !pregnancyMissing;
  const preps = picked.filter((p) => p.preparation);

  async function send() {
    setBusy(true);
    onError?.("");
    try {
      const list = [...picked, ...(custom.trim() ? [{ key: "custom", name: custom.trim(), modality: "" }] : [])];
      const sent = [];
      for (const p of list) {
        const { radiologyOrder } = await apiSend(`/api/opd/consultations/${consultationId}/radiology-orders`, "POST", {
          studyName: p.name,
          ...(p.serviceId ? { serviceId: p.serviceId } : {}),
          priority: f.priority,
          modality: p.modality || "",
          bodyPart: p.bodyPart || "",
          laterality: f.laterality,
          contrast: f.contrast || undefined,
          clinicalIndication: f.indication.trim(),
          pregnancyStatus: askPregnancy && f.pregnancy ? f.pregnancy : "NOT_APPLICABLE",
          safetyFlags: needsSafety ? f.flags : [],
          mobility: f.mobility,
          instructions: f.instructions.trim(),
        });
        sent.push(radiologyOrder);
        onOrdered(radiologyOrder);
      }
      setDone(sent);
      setPicked([]);
      setCustom("");
      setF((x) => ({ ...x, indication: "", instructions: "", flags: [], contrast: "", pregnancy: "" }));
    } catch (err) {
      onError?.(`Could not send (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  if (catalog === undefined) return <p className="mt-3 text-xs text-slate-400">Loading radiology…</p>;

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs">
        <span className="font-medium text-slate-500">Sending to:</span>
        {catalog ? (
          <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold shadow-sm">{catalog.name}</span>
        ) : (
          <span className="text-amber-700">No radiology department is set up here — the order is recorded on the chart; print the requisition for the patient to take to an imaging centre.</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {["", ...modalities].map((m) => (
          <button key={m || "all"} type="button" onClick={() => setModality(m)} className={`rounded-full px-3 py-1 text-xs font-medium ${modality === m ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{m || "All"}</button>
        ))}
      </div>
      <label className={lab}>Search studies &amp; study sets
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="chest, knee, MRI brain, abdomen…" className={`${inp} mt-1`} />
      </label>

      {rows.length > 0 && (
        <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white">
          {rows.map((r) => (
            <button key={r.key} type="button" onClick={() => toggle(r)} className={`flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 ${isPicked(r.key) ? "bg-emerald-50" : ""}`}>
              <span>
                <span className="block font-medium">{r.name}{r.kind === "set" && <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">Study Set</span>}</span>
                <span className="block text-xs text-slate-500">{[catalog?.name, r.modality, r.bodyPart, r.turnaroundHours ? `${r.turnaroundHours}h` : ""].filter(Boolean).join(" · ")}</span>
                {r.kind === "set" && <span className="block text-[11px] text-slate-400">{r.studies.map((s) => s.name).join(", ")}</span>}
                {r.preparation && <span className="block text-[11px] text-amber-700">Prep: {r.preparation}</span>}
              </span>
              <span className="shrink-0 text-right text-xs">
                {r.price != null && <span className="block font-medium">₹{r.price}</span>}
                <span className={isPicked(r.key) ? "text-emerald-700" : "text-slate-400"}>{isPicked(r.key) ? "✓ Selected" : "Available"}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <summary className="cursor-pointer select-none text-xs font-medium text-slate-600">Common studies (quick add)</summary>
        <div className="mt-2 space-y-2">
          {Object.entries(COMMON_STUDIES).filter(([m]) => !modality || m === modality).map(([m, list]) => (
            <div key={m}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{m}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {list.map((n) => <button key={n} type="button" onClick={() => addCommon(n, m)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50">{n}</button>)}
              </div>
            </div>
          ))}
        </div>
      </details>

      <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Other study not listed (type the name)" className={inp} />

      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
              {p.modality ? <b className="font-semibold">{p.modality}</b> : null} {p.name}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPicked((xs) => xs.filter((x) => x.key !== p.key))} className="text-slate-400 hover:text-red-600">×</button>
            </span>
          ))}
        </div>
      )}
      {preps.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Patient preparation: {preps.map((p) => `${p.name} — ${p.preparation}`).join(" · ")}
        </p>
      )}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-2">
        <label className={`${lab} sm:col-span-2`}>Clinical history &amp; question <span className="text-red-500">*</span>
          <textarea rows={2} required value={f.indication} onChange={(e) => setF({ ...f, indication: e.target.value })} placeholder="e.g. Fever 5 days with cough, crepitations right base — rule out pneumonia" className={`${inp} mt-1`} />
          <span className={help}>Why the scan is needed and what you want answered. The radiologist reads this first.</span>
        </label>
        <label className={lab}>Priority
          <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className={`${inp} mt-1`}>
            <option value="ROUTINE">Routine — within the normal time</option>
            <option value="URGENT">Urgent — same day</option>
            <option value="STAT">STAT — immediately</option>
          </select>
        </label>
        <label className={lab}>Side
          <select value={f.laterality} onChange={(e) => setF({ ...f, laterality: e.target.value })} className={`${inp} mt-1`}>
            <option value="NA">Not applicable</option><option value="LEFT">Left</option><option value="RIGHT">Right</option><option value="BOTH">Both sides</option>
          </select>
          <span className={help}>For limbs, breast, kidneys etc.</span>
        </label>
        <label className={lab}>Contrast
          <select value={f.contrast} onChange={(e) => setF({ ...f, contrast: e.target.value })} className={`${inp} mt-1`}>
            <option value="">Not decided</option><option value="NONE">Without contrast</option><option value="WITH">With contrast</option><option value="LET_RADIOLOGIST_DECIDE">Radiologist to decide</option>
          </select>
        </label>
        <label className={lab}>Patient mobility
          <select value={f.mobility} onChange={(e) => setF({ ...f, mobility: e.target.value })} className={`${inp} mt-1`}>
            <option value="WALKING">Walking</option><option value="WHEELCHAIR">Wheelchair</option><option value="STRETCHER">Stretcher / bed</option>
          </select>
        </label>
        {askPregnancy && (
          <label className={lab}>Pregnancy {radiation && female ? <span className="text-red-500">*</span> : null}
            <select value={f.pregnancy} onChange={(e) => setF({ ...f, pregnancy: e.target.value })} className={`${inp} mt-1 ${pregnancyMissing ? "border-red-300" : ""}`}>
              <option value="">— choose —</option><option value="NO">Not pregnant</option><option value="POSSIBLE">Possibly pregnant</option><option value="YES">Pregnant</option><option value="NOT_APPLICABLE">Not applicable</option>
            </select>
            <span className={help}>{radiation && female ? "Required for X-ray / CT — radiation." : "Ask before any radiation study."}</span>
          </label>
        )}
        {needsSafety && (
          <fieldset className="sm:col-span-2">
            <legend className={lab}>Safety screening (MRI / CT / contrast)</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {SAFETY_FLAGS.map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={f.flags.includes(k)} onChange={(e) => setF({ ...f, flags: e.target.checked ? [...f.flags, k] : f.flags.filter((x) => x !== k) })} /> {l}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className={`${lab} sm:col-span-2`}>Special instructions
          <input value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} placeholder="e.g. compare with previous X-ray of 12/08/26" className={`${inp} mt-1`} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={send} disabled={busy || !canSend} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">
          {busy ? "Sending…" : catalog ? `Send to ${catalog.name}` : "Save imaging order"}
        </button>
        {!canSend && (picked.length > 0 || custom.trim()) && <span className="text-xs text-slate-400">{f.indication.trim().length < 3 ? "Add the clinical history first." : "Choose the pregnancy status."}</span>}
        {done.length > 0 && (
          <span className="text-xs text-emerald-700">
            Sent {done.length} {done.length === 1 ? "study" : "studies"}.{" "}
            {done.map((d) => <a key={d.id} href={`/print/radiology-order/${d.id}`} target="_blank" rel="noopener noreferrer" className="mr-2 underline">Print requisition #{d.id}</a>)}
          </span>
        )}
      </div>
    </div>
  );
}
