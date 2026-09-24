"use client";

import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { useRealtime } from "./useRealtime";

const STATE = {
  ON_DUTY: ["On duty now", "bg-emerald-100 text-emerald-800"],
  LATER: ["Starts later", "bg-sky-100 text-sky-800"],
  ENDED: ["Shift over", "bg-slate-200 text-slate-600"],
  OFF_TODAY: ["Off today", "bg-slate-200 text-slate-600"],
  ON_LEAVE: ["On leave", "bg-amber-100 text-amber-800"],
  NOT_SET: ["Timing not set", "bg-slate-100 text-slate-500"],
};
const unavailable = (d) => ["ENDED", "OFF_TODAY", "ON_LEAVE"].includes(d.state);

// Reception chooses which doctor the patient will see. Each card shows the doctor's timing today,
// how many are waiting, and about when a patient registered now would be seen.
export default function DoctorPicker({ value, onChange }) {
  const [doctors, setDoctors] = useState(null);
  const [minutes, setMinutes] = useState(10);

  const load = () =>
    apiGet("/api/registration/doctors")
      .then((d) => { setDoctors(d.doctors); setMinutes(d.minutesPerPatient); })
      .catch(() => setDoctors([]));
  useEffect(() => { load(); }, []);
  // The waiting count changes as patients are registered / called.
  useRealtime({ "visit:created": load, "visit:updated": load }, load);

  // Pre-select the on-duty doctor with the shortest wait, once.
  useEffect(() => {
    if (!doctors || value !== "") return;
    const open = doctors.filter((d) => !unavailable(d));
    if (open.length) onChange(String(open.sort((a, b) => a.ahead - b.ahead)[0].id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors]);

  if (doctors === null) return <p className="text-xs text-slate-400">Loading doctors…</p>;
  if (doctors.length === 0) return null; // solo / no doctors set up — registration works as before

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Consulting doctor</p>
        <p className="text-[11px] text-slate-400">Estimate ≈ {minutes} min per patient</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {doctors.map((d) => {
          const [label, tone] = STATE[d.state];
          const selected = String(d.id) === String(value);
          return (
            <button
              type="button"
              key={d.id}
              onClick={() => onChange(String(d.id))}
              className={`rounded-lg border p-2.5 text-left text-sm transition ${selected ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-400"} ${unavailable(d) ? "opacity-60" : ""}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-medium">{/^dr\.?\s/i.test(d.name) ? d.name : `Dr. ${d.name}`}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>{label}</span>
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {d.timing ? `Timing ${d.timing}` : "No timing set"} · {d.waiting} waiting{d.withDoctor ? " · 1 with doctor" : ""}
              </span>
              <span className="mt-0.5 block text-xs font-medium text-slate-700">
                {d.eta ? `Your turn ≈ ${d.eta}${d.beyondShift ? " (after shift — may move to another day)" : ""}` : unavailable(d) ? "Not available today" : `${d.ahead} ahead of you`}
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => onChange("")} className={`text-xs underline ${value === "" ? "text-slate-900" : "text-slate-500"}`}>
        {value === "" ? "Any available doctor (selected)" : "Any available doctor"}
      </button>
    </div>
  );
}
