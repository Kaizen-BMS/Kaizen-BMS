"use client";

import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { fmtDDMMYY } from "@/lib/dateFormat";

const FILTERS = [
  ["all", "All"],
  ["rx", "Prescriptions"],
  ["dx", "Diagnoses"],
  ["lab", "Lab"],
  ["rad", "Radiology"],
];

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Right-hand panel of the consultation screen: everything this patient has had
// before, without leaving the page. Uses the same history API (and its
// clinical-data permission check) as the rest of the product.
export default function PatientHistorySidebar({ patientId, currentVisitId, onUseMedicines }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!patientId) return;
    apiGet(`/api/patients/${patientId}/history`).then(setData).catch((e) => setErr(e.message));
  }, [patientId]);

  if (err) return null;
  if (!data) return <aside className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-400 shadow-sm">Loading patient history…</aside>;
  const past = data.visits.filter((v) => v.id !== currentVisitId);
  const show = (k) => filter === "all" || filter === k;

  return (
    <aside className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto" aria-label="Patient history">
      <div>
        <p className="text-sm font-semibold tracking-wide">PATIENT HISTORY</p>
        <p className="text-xs text-slate-500">{data.totalVisits} visit{data.totalVisits === 1 ? "" : "s"} so far</p>
      </div>
      {data.upcomingAppointments.length > 0 && (
        <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">Upcoming: {data.upcomingAppointments.map((a) => fmtDDMMYY(a.at)).join(", ")}</p>
      )}
      {data.clinical && (
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${filter === k ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</button>
          ))}
        </div>
      )}
      {past.length === 0 && <p className="text-sm text-slate-400">First visit — no earlier records.</p>}
      {/* Only the most recent visit opens by default — everything older stays collapsed until
          the doctor deliberately expands it, so the panel doesn't dump the whole chart at once. */}
      <ol className="space-y-2.5">
        {past.map((v, i) => (
          <li key={v.id}>
          <details open={i === 0} className="group rounded-xl border border-slate-200 bg-slate-50/60 text-xs [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <span className="text-slate-400 transition group-open:rotate-90">▶</span>
                {fmtDDMMYY(v.date)}
                {i === 0 && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">Latest</span>}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">{String(v.type || "").replace("_", " ").toLowerCase()}</span>
            </summary>
            <div className="px-3 pb-3">
            {v.reason && <p className="mt-1 text-slate-500">Reason: {v.reason}</p>}
            {data.clinical && (
              <div className="mt-1.5 space-y-1.5">
                {show("dx") && (v.diagnosis || v.notes) && (
                  <p><span className="font-medium text-slate-500">Diagnosis:</span> {v.diagnosis || "—"}{v.notes ? <span className="block text-slate-500">{v.notes}</span> : null}</p>
                )}
                {show("rx") && v.medicines?.length > 0 && (
                  <div>
                    <p className="flex items-center justify-between font-medium text-slate-500">
                      <span>Prescription</span>
                      {onUseMedicines && <button type="button" onClick={() => onUseMedicines(v.medicines)} className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-700">Use all in today&apos;s prescription</button>}
                    </p>
                    <ul className="ml-3 list-disc">{v.medicines.map((m, i) => (
                      <li key={i}>
                        {m.name} — {m.dosage || "—"} × {m.quantity}
                        {onUseMedicines && <button type="button" onClick={() => onUseMedicines([m])} className="ml-1.5 rounded border border-slate-300 px-1.5 text-[10px] text-slate-600 hover:bg-white">+ add</button>}
                      </li>
                    ))}</ul>
                  </div>
                )}
                {show("lab") && v.labTests?.length > 0 && (
                  <div><p className="font-medium text-slate-500">Lab</p>
                    {v.labTests.map((l, i) => (
                      <div key={i} className="ml-3">
                        <p>{asList(l.tests).map((t) => (typeof t === "string" ? t : t?.name)).join(", ")} <span className="text-slate-400">({String(l.status).toLowerCase()})</span></p>
                        {asList(l.results).map((r, j) => (
                          <p key={j} className={r.flag && r.flag !== "NORMAL" ? "font-bold text-red-700" : "text-slate-600"}>{r.testName}: {r.result} {r.units || ""}{r.flag && r.flag !== "NORMAL" ? ` (${r.flag})` : ""}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {show("rad") && v.radiology?.length > 0 && (
                  <div><p className="font-medium text-slate-500">Radiology</p>
                    {v.radiology.map((r, i) => <p key={i} className="ml-3">{r.study} <span className="text-slate-400">({String(r.status).toLowerCase()})</span>{r.impression ? ` — ${r.impression}` : ""}</p>)}
                  </div>
                )}
              </div>
            )}
            </div>
          </details>
          </li>
        ))}
      </ol>
    </aside>
  );
}
