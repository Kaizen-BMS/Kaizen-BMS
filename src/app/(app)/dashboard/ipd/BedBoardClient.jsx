"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";

const WARD_LABEL = { GENERAL: "General Ward", PRIVATE: "Private Rooms", ICU: "ICU" };
const STATUS_STYLE = {
  VACANT: "bg-green-50 border-green-300 text-green-800",
  OCCUPIED: "bg-red-50 border-red-300 text-red-800",
  CLEANING: "bg-amber-50 border-amber-300 text-amber-800",
  MAINTENANCE: "bg-slate-100 border-slate-300 text-slate-500",
};

function upsertBed(list, bed) {
  return list.some((b) => b.id === bed.id)
    ? list.map((b) => (b.id === bed.id ? { ...b, ...bed } : b))
    : [...list, bed];
}

export default function BedBoardClient({ permissions }) {
  const { canAdmit, canDischarge, canManageBeds } = permissions;
  const [beds, setBeds] = useState([]);
  const [msg, setMsg] = useState("");
  const [admitBed, setAdmitBed] = useState(null); // bed being admitted onto
  const [summaryBed, setSummaryBed] = useState(null); // occupied bed clicked
  const [flashIds, setFlashIds] = useState(new Set());

  function flash(id) {
    setFlashIds((s) => new Set(s).add(id));
    setTimeout(() => {
      setFlashIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 2000);
  }

  async function load() {
    const { beds } = await apiGet("/api/ipd/beds");
    setBeds(beds);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg(e.message));
  }, []);

  useRealtime(
    {
      "bed:updated": ({ bed }) => {
        flash(bed.id);
        setBeds((bs) => upsertBed(bs, bed));
      },
      "admission:created": () => load(),
      "admission:discharged": () => load(),
    },
    load,
  );

  const wards = ["GENERAL", "PRIVATE", "ICU"].map((w) => ({
    ward: w,
    beds: beds.filter((b) => b.ward_type === w),
  })).filter((g) => g.beds.length > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">IPD / Beds</h1>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {beds.length === 0 && !msg && (
        <p className="text-sm text-slate-400">No beds set up yet.</p>
      )}

      {wards.map((g) => (
        <div key={g.ward}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {WARD_LABEL[g.ward]}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {g.beds.map((b) => {
              const clickable =
                (b.status === "VACANT" && canAdmit) || b.status === "OCCUPIED";
              return (
                <button
                  key={b.id}
                  onClick={() =>
                    b.status === "VACANT" && canAdmit
                      ? setAdmitBed(b)
                      : b.status === "OCCUPIED"
                        ? setSummaryBed(b)
                        : null
                  }
                  className={`rounded-lg border-2 p-3 text-left text-sm transition ${STATUS_STYLE[b.status]} ${
                    flashIds.has(b.id) ? "hms-flash" : ""
                  } ${clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                >
                  <p className="font-semibold">{b.bed_number}</p>
                  <p className="text-xs">{b.status}</p>
                  {b.status === "OCCUPIED" && (
                    <p className="mt-1 truncate text-xs">{b.patient_name}</p>
                  )}
                  {b.status === "CLEANING" && canManageBeds && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        apiSend(`/api/ipd/beds/${b.id}`, "PATCH", { status: "VACANT" }).catch(
                          (err) => setMsg(err.message),
                        );
                      }}
                      className="mt-1 inline-block underline"
                    >
                      mark ready
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {admitBed && (
        <AdmitModal bed={admitBed} onClose={() => setAdmitBed(null)} onError={setMsg} />
      )}
      {summaryBed && (
        <SummaryPopover
          bed={summaryBed}
          canDischarge={canDischarge}
          onClose={() => setSummaryBed(null)}
          onError={setMsg}
        />
      )}
    </div>
  );
}

function AdmitModal({ bed, onClose, onError }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [newPatient, setNewPatient] = useState({ name: "", age: "", phone: "" });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function search() {
    if (q.trim().length < 2) return;
    try {
      const { patients } = await apiGet(
        `/api/registration/patients?q=${encodeURIComponent(q.trim())}`,
      );
      setResults(patients);
    } catch (err) {
      onError(err.message);
    }
  }

  async function admit(patientId) {
    setBusy(true);
    try {
      await apiSend("/api/ipd/admissions", "POST", {
        bedId: bed.id,
        reason,
        ...(patientId
          ? { patientId }
          : { name: newPatient.name, age: newPatient.age || undefined, phone: newPatient.phone }),
      });
      onClose();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Admit to ${bed.bed_number}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold">Find existing patient</p>
          <div className="mt-1 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="name or phone"
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button onClick={search} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white">
              Find
            </button>
          </div>
          {results?.map((p) => (
            <div
              key={p.id}
              className="mt-2 flex items-center justify-between rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <span>{p.name} · {p.age}y · {p.phone}</span>
              <button
                onClick={() => admit(p.id)}
                disabled={busy}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                Admit
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 pt-3">
          <p className="text-sm font-semibold">Or admit a new patient</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <input
              placeholder="name"
              value={newPatient.name}
              onChange={(e) => setNewPatient((s) => ({ ...s, name: e.target.value }))}
              className="col-span-3 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:col-span-1"
            />
            <input
              placeholder="age"
              type="number"
              value={newPatient.age}
              onChange={(e) => setNewPatient((s) => ({ ...s, age: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              placeholder="phone"
              value={newPatient.phone}
              onChange={(e) => setNewPatient((s) => ({ ...s, phone: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <input
          placeholder="reason for admission"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />

        <button
          onClick={() => admit(null)}
          disabled={busy || !newPatient.name || !newPatient.phone}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Admit new patient
        </button>
      </div>
    </Modal>
  );
}

function SummaryPopover({ bed, canDischarge, onClose, onError }) {
  const [dischargeType, setDischargeType] = useState("ROUTINE");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function discharge() {
    setBusy(true);
    try {
      await apiSend(`/api/ipd/admissions/${bed.admission_id}`, "PATCH", {
        dischargeType,
        dischargeNotes: notes,
      });
      onClose();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={bed.bed_number} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="font-medium">{bed.patient_name} · {bed.patient_age}y</p>
        <p className="text-slate-500">
          Admitted {bed.admitted_at ? new Date(bed.admitted_at).toLocaleString() : ""}
        </p>
        <Link
          href={`/dashboard/ipd/admissions/${bed.admission_id}`}
          className="text-slate-600 underline"
        >
          View full admission record →
        </Link>

        {canDischarge && (
          <div className="border-t border-slate-200 pt-3">
            <p className="font-semibold">Discharge</p>
            <select
              value={dischargeType}
              onChange={(e) => setDischargeType(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="ROUTINE">Routine</option>
              <option value="TRANSFER">Transfer to another facility</option>
              <option value="AGAINST_MEDICAL_ADVICE">Against medical advice</option>
              <option value="DEATH">Death</option>
            </select>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="discharge notes"
              rows={2}
              className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={discharge}
              disabled={busy}
              className="mt-2 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Discharge
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">{title}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
