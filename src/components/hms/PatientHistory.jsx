"use client";

import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { wall } from "@/lib/wallClock";

const fmt = (d) => new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const fmtWall = (d) => wall(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// "How many times has this patient come, and what happened each time."
export default function PatientHistory({ patientId, currentVisitId, defaultOpen = false, children }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(defaultOpen);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!patientId) return;
    apiGet(`/api/patients/${patientId}/history`).then(setData).catch((e) => setErr(e.message));
  }, [patientId]);

  if (err) return null;
  if (!data) return <p className="text-xs text-slate-400">Loading history…</p>;
  const past = data.visits.filter((v) => v.id !== currentVisitId);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Patient history <span className="font-normal text-slate-500">· {data.totalVisits} visit{data.totalVisits === 1 ? "" : "s"} so far</span>
        </p>
        <button onClick={() => setOpen((o) => !o)} className="text-xs text-slate-600 underline">{open ? "Hide" : "Show"}</button>
      </div>
      {data.upcomingAppointments.length > 0 && (
        <p className="mt-1 text-xs text-emerald-700">
          Upcoming: {data.upcomingAppointments.map((a) => fmtWall(a.at)).join(" · ")}
        </p>
      )}
      {children}
      {open && (
        <ul className="mt-3 space-y-2">
          {past.length === 0 && <li className="text-sm text-slate-400">No earlier visits.</li>}
          {past.map((v) => (
            <li key={v.id} className="rounded-md bg-slate-50 p-2.5 text-sm">
              <p className="flex flex-wrap items-center justify-between text-xs text-slate-500">
                <span>{fmt(v.date)} · {v.type.replace("_", " ").toLowerCase()}</span>
                <span>{v.status.toLowerCase()}</span>
              </p>
              {v.reason && <p>Reason: {v.reason}</p>}
              {data.clinical && (
                <>
                  {v.diagnosis && <p><span className="text-slate-500">Diagnosis:</span> {v.diagnosis}</p>}
                  {v.notes && <p className="text-slate-600">{v.notes}</p>}
                  {v.medicines.length > 0 && (
                    <p><span className="text-slate-500">Medicines:</span> {v.medicines.map((m) => `${m.name} ${m.dosage || ""} × ${m.quantity}`.trim()).join("; ")}</p>
                  )}
                  {v.labTests.length > 0 && (
                    <p><span className="text-slate-500">Lab:</span> {v.labTests.map((l) => `${Array.isArray(l.tests) ? l.tests.join(", ") : l.tests} (${l.status.toLowerCase()})`).join("; ")}</p>
                  )}
                  {v.radiology.length > 0 && (
                    <p><span className="text-slate-500">Radiology:</span> {v.radiology.map((r) => `${r.study} (${r.status.toLowerCase()})`).join("; ")}</p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
