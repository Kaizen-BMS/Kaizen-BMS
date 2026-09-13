"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";

export default function AdmissionDetailClient({ admissionId, canAddNote }) {
  const [admission, setAdmission] = useState(null);
  const [note, setNote] = useState("");
  const [vitals, setVitals] = useState({ bp: "", pulse: "", temp: "", spo2: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { admission } = await apiGet(`/api/ipd/admissions/${admissionId}`);
    setAdmission(admission);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admissionId]);

  useRealtime(
    {
      "nursingnote:created": ({ admissionId: aid }) => {
        if (aid === admissionId) load();
      },
      "admission:discharged": ({ admission: a }) => {
        if (a.id === admissionId) setAdmission(a);
      },
    },
    load,
  );

  async function addNote(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const v = {};
      if (vitals.bp) v.bp = vitals.bp;
      if (vitals.pulse) v.pulse = vitals.pulse;
      if (vitals.temp) v.temp = vitals.temp;
      if (vitals.spo2) v.spo2 = vitals.spo2;
      await apiSend(`/api/ipd/admissions/${admissionId}/nursing-notes`, "POST", {
        note,
        vitals: v,
      });
      setNote("");
      setVitals({ bp: "", pulse: "", temp: "", spo2: "" });
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!admission) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/dashboard/ipd" className="text-sm text-slate-500 hover:underline">
          ← Bed board
        </Link>
        <h1 className="mt-1 text-xl font-semibold">
          {admission.patient_name}{" "}
          <span className="text-sm font-normal text-slate-400">
            · {admission.patient_age}y · {admission.ward_type} {admission.bed_number}
          </span>
        </h1>
        <div className="mt-1 flex items-center gap-2">
          <AllergyBadge allergies={admission.patient_allergies} />
          {admission.discharged_at && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              Discharged ({admission.discharge_type})
            </span>
          )}
        </div>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      {!admission.discharged_at && canAddNote && (
        <form onSubmit={addNote} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold">Add nursing note</p>
          <div className="grid grid-cols-4 gap-2">
            <input
              placeholder="BP"
              value={vitals.bp}
              onChange={(e) => setVitals((s) => ({ ...s, bp: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="Pulse"
              value={vitals.pulse}
              onChange={(e) => setVitals((s) => ({ ...s, pulse: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="Temp °F"
              value={vitals.temp}
              onChange={(e) => setVitals((s) => ({ ...s, temp: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="SpO2 %"
              value={vitals.spo2}
              onChange={(e) => setVitals((s) => ({ ...s, spo2: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="note"
            rows={2}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            disabled={busy}
            className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Add note
          </button>
        </form>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">Nursing notes</p>
        {admission.nursing_notes.length === 0 && (
          <p className="text-sm text-slate-400">No notes yet.</p>
        )}
        {admission.nursing_notes.map((n) => (
          <div key={n.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <p className="text-xs text-slate-400">
              {n.author_name} · {new Date(n.created_at).toLocaleString()}
            </p>
            {n.vitals && <VitalsLine vitals={n.vitals} />}
            {n.note && <p className="mt-1">{n.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function VitalsLine({ vitals }) {
  const v = typeof vitals === "string" ? JSON.parse(vitals) : vitals;
  const parts = [];
  if (v.bp) parts.push(`BP ${v.bp}`);
  if (v.pulse) parts.push(`Pulse ${v.pulse}`);
  if (v.temp) parts.push(`Temp ${v.temp}°F`);
  if (v.spo2) parts.push(`SpO2 ${v.spo2}%`);
  if (parts.length === 0) return null;
  return <p className="mt-1 text-xs font-medium text-slate-600">{parts.join(" · ")}</p>;
}
