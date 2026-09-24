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
export default function PatientHistorySidebar({ patientId, currentVisitId }) {
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
      <ol className="space-y-2.5">
        {past.map((v) => (
          <li key={v.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
            <p className="flex items-center justify-between font-semibold text-slate-700">
              <span>{fmtDDMMYY(v.date)}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">{String(v.type || "").replace("_", " ").toLowerCase()}</span>
            </p>
            {v.reason && <p className="mt-1 text-slate-500">Reason: {v.reason}</p>}
            {data.clinical && (
              <div className="mt-1.5 space-y-1.5">
                {show("dx") && (v.diagnosis || v.notes) && (
                  <p><span className="font-medium text-slate-500">Diagnosis:</span> {v.diagnosis || "—"}{v.notes ? <span className="block text-slate-500">{v.notes}</span> : null}</p>
                )}
                {show("rx") && v.medicines?.length > 0 && (
                  <div><p className="font-medium text-slate-500">Prescription</p>
                    <ul className="ml-3 list-disc">{v.medicines.map((m, i) => <li key={i}>{m.name} — {m.dosage || "—"} × {m.quantity}</li>)}</ul>
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
          </li>
        ))}
      </ol>
    </aside>
  );
}
