"use client";
import { fmtDDMMYYTime } from "@/lib/dateFormat";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/components/hms/api";
import AllergyBadge from "@/components/hms/AllergyBadge";
import PatientHistory from "@/components/hms/PatientHistory";
import { usePrintSettings, openSlip } from "@/components/hms/usePrintSettings";

const fmt = (d) => fmtDDMMYYTime(d);

// One patient's page: who they are, how often they came, what happened each
// time (history), and quick actions — new visit, print slip, book appointment.
export default function PatientDetailClient({ id, canVisit, canBook }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const ps = usePrintSettings();

  const load = useCallback(() => {
    apiGet(`/api/patients/${id}`).then(setD).catch((e) => setError(e.message === "patient_not_found" ? "This patient was not found." : e.message));
  }, [id]);
  useEffect(load, [load]);

  async function newVisit() {
    setBusy(true);
    setNote("");
    try {
      const r = await apiSend("/api/registration/visits", "POST", { patientId: id });
      setNote(`New visit opened — token ${r.visit?.token_number ?? "—"}.`);
      if (r.visit?.id && ps?.slip?.enabled !== false && ps?.slip?.autoPrint) openSlip(r.visit.id, true);
      load();
    } catch (e) {
      setNote(`Could not open a visit (${e.message}).`);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="space-y-3"><p className="text-sm text-red-600">{error}</p><Link href="/dashboard/patients" className="text-sm underline">← All patients</Link></div>;
  if (!d) return <p className="text-sm text-slate-400">Loading…</p>;
  const p = d.patient;
  const cell = (label, value) => (<div><p className="text-xs text-slate-500">{label}</p><p className="text-sm">{value || "—"}</p></div>);
  return (
    <div className="max-w-4xl space-y-4">
      <Link href="/dashboard/patients" className="text-sm text-slate-500 underline">← All patients</Link>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{p.name}</h1>
            <p className="text-sm text-slate-500">{p.age ?? "?"} years{p.gender ? ` · ${p.gender.toLowerCase()}` : ""} · {p.phone}</p>
            <div className="mt-2"><AllergyBadge allergies={JSON.stringify(p.allergies)} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canVisit && <button onClick={newVisit} disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">New visit</button>}
            {d.latestVisit && ps?.slip?.enabled !== false && <button onClick={() => openSlip(d.latestVisit.id, false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Print slip</button>}
            {canBook && <Link href="/dashboard/appointments" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Book appointment</Link>}
          </div>
        </div>
        {note && <p className="mt-3 text-sm text-emerald-700">{note}</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cell("Email", p.email)}
          {cell("ABHA ID", p.abhaId)}
          {cell("Payment", `${p.paymentCategory.replace(/_/g, " ").toLowerCase()}${p.insurance ? ` · ${p.insurance}` : ""}`)}
          {cell("Registered", fmt(p.registeredAt))}
          {cell("Last visit", d.latestVisit ? `${fmt(d.latestVisit.at)} · token ${d.latestVisit.token ?? "—"}` : "No visits yet")}
        </div>
      </div>
      <PatientHistory patientId={p.id} defaultOpen />
    </div>
  );
}
