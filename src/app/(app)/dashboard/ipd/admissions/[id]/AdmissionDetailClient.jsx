"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";

// A numeric or BP vital is flagged out-of-range against the tenant's own
// configured range_config (see CLAUDE.md "vital_parameters") — bolded to
// draw attention rather than making a nurse pick Normal/High/Low by hand.
function isOutOfRange(param, value) {
  if (!param || !value) return false;
  const r = param.range_config;
  if (!r) return false;
  if (param.value_type === "NUMBER") {
    if (typeof r.min !== "number" || typeof r.max !== "number") return false;
    const v = parseFloat(value);
    if (Number.isNaN(v)) return false;
    return v < r.min || v > r.max;
  }
  if (param.value_type === "BP") {
    if (!r.systolic || !r.diastolic) return false;
    const m = String(value).match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (!m) return false;
    const sys = parseFloat(m[1]);
    const dia = parseFloat(m[2]);
    return sys < r.systolic.min || sys > r.systolic.max || dia < r.diastolic.min || dia > r.diastolic.max;
  }
  return false;
}

export default function AdmissionDetailClient({ admissionId, canAddNote }) {
  const [admission, setAdmission] = useState(null);
  const [note, setNote] = useState("");
  const [vitals, setVitals] = useState({});
  const [vitalParams, setVitalParams] = useState([]); // all (incl. inactive, for historical display)
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { admission } = await apiGet(`/api/ipd/admissions/${admissionId}`);
    setAdmission(admission);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg(e.message));
    apiGet("/api/ipd/vital-parameters?all=1")
      .then((d) => setVitalParams(d.vitalParameters))
      .catch(() => {});
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
      "vitalparam:updated": ({ vitalParameter }) => {
        setVitalParams((ps) =>
          ps.some((p) => p.id === vitalParameter.id)
            ? ps.map((p) => (p.id === vitalParameter.id ? vitalParameter : p))
            : [...ps, vitalParameter],
        );
      },
    },
    load,
  );

  const activeParams = vitalParams.filter((p) => p.active).sort((a, b) => a.display_order - b.display_order);

  async function addNote(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const v = {};
      for (const p of activeParams) {
        if (vitals[p.field_key]) v[p.field_key] = vitals[p.field_key];
      }
      await apiSend(`/api/ipd/admissions/${admissionId}/nursing-notes`, "POST", {
        note,
        vitals: v,
      });
      setNote("");
      setVitals({});
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
          {activeParams.length === 0 ? (
            <p className="text-xs text-slate-400">
              No vitals parameters configured for this hospital yet — ask your admin to add some under
              “Manage vitals” on the bed board.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {activeParams.map((p) => {
                const val = vitals[p.field_key] || "";
                const bad = isOutOfRange(p, val);
                return (
                  <input
                    key={p.id}
                    placeholder={
                      p.value_type === "BP" ? `${p.label} (e.g. 120/80)` : p.unit ? `${p.label} (${p.unit})` : p.label
                    }
                    value={val}
                    onChange={(e) => setVitals((s) => ({ ...s, [p.field_key]: e.target.value }))}
                    className={`rounded-md border px-2 py-1 text-sm ${
                      bad ? "border-red-400 font-bold text-red-700" : "border-slate-300"
                    }`}
                  />
                );
              })}
            </div>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="note"
            rows={2}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button
            disabled={busy}
            className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
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
            {n.vitals && <VitalsLine vitals={n.vitals} vitalParams={vitalParams} />}
            {n.note && <p className="mt-1">{n.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Re-derives label/unit/out-of-range status from the CURRENT parameter
// definitions every time — never cached on the note itself — so a later
// range/label edit is reflected on every past note too, not just new ones.
function VitalsLine({ vitals, vitalParams }) {
  const v = typeof vitals === "string" ? JSON.parse(vitals) : vitals;
  const keys = Object.keys(v).filter((k) => v[k]);
  if (keys.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-slate-600">
      {keys.map((k, i) => {
        const p = vitalParams.find((p) => p.field_key === k);
        const label = p ? p.label : k.toUpperCase();
        const unit = p?.unit ? (p.value_type === "BP" ? "" : ` ${p.unit}`) : "";
        const bad = isOutOfRange(p, v[k]);
        return (
          <span key={k} className={bad ? "font-bold text-red-700" : "font-medium"}>
            {label} {v[k]}
            {unit}
            {i < keys.length - 1 ? " · " : ""}
          </span>
        );
      })}
    </p>
  );
}
