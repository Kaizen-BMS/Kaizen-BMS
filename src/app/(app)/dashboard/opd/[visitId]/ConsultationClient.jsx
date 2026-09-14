"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/components/hms/api";
import DynamicForm, { splitValues } from "@/components/hms/DynamicForm";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";
import DoctorSlotPicker from "@/components/hms/DoctorSlotPicker";
import { parseMaybeJson } from "@/components/hms/json";
import { matchAllergy } from "@/lib/allergyCheck";

function upsertById(list, item) {
  return list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];
}

export default function ConsultationClient({ visitId, doctorUserId }) {
  const [data, setData] = useState(null); // { visit, consultation, prescriptions, labOrders }
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  const [rx, setRx] = useState([{ medicineName: "", dosage: "", quantity: 1, ack: false }]);
  const [tests, setTests] = useState([""]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpMsg, setFollowUpMsg] = useState("");

  const fields = useMemo(
    () => (form ? [...form.core, ...form.extra] : []),
    [form],
  );

  async function load() {
    const d = await apiGet(`/api/opd/visits/${visitId}`);
    setData(d);
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load().catch((e) => setMsg(e.message));
    apiGet("/api/forms/CONSULTATION").then((d) => setForm(d.form));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  useRealtime(
    {
      "consultation:created": ({ consultation }) =>
        setData((d) =>
          d && consultation.visit_id === visitId
            ? { ...d, consultation }
            : d,
        ),
      "prescription:created": ({ prescription }) =>
        setData((d) =>
          d && d.consultation && prescription.consultation_id === d.consultation.id
            ? { ...d, prescriptions: upsertById(d.prescriptions, prescription) }
            : d,
        ),
      "laborder:created": ({ labOrder }) =>
        setData((d) =>
          d && d.consultation && labOrder.consultation_id === d.consultation.id
            ? { ...d, labOrders: upsertById(d.labOrders, labOrder) }
            : d,
        ),
    },
    load,
  );

  if (!data) {
    return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;
  }

  const { visit, consultation, prescriptions, labOrders } = data;
  const patientAllergies = parseMaybeJson(visit.patient_allergies) || [];

  async function saveConsultation(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const { core, custom } = splitValues(form, values);
      const { consultation } = await apiSend("/api/opd/consultations", "POST", {
        visitId,
        notes: core.notes || "",
        diagnosis: core.diagnosis || "",
        fee: core.fee,
        customFields: custom,
      });
      setValues({});
      setData((d) => ({ ...d, consultation }));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const rxRows = rx.map((r) => ({
    ...r,
    match: matchAllergy(r.medicineName, patientAllergies),
  }));
  const blockedByAllergy = rxRows.some((r) => r.match && !r.ack);

  async function savePrescription() {
    if (blockedByAllergy) return;
    const items = rx
      .filter((r) => r.medicineName.trim())
      .map((r) => ({
        medicineName: r.medicineName.trim(),
        dosage: r.dosage.trim(),
        quantity: Number(r.quantity) || 1,
        allergyAck: r.ack,
      }));
    if (items.length === 0) return;
    setBusy(true);
    setMsg("");
    try {
      const { prescription } = await apiSend(
        `/api/opd/consultations/${consultation.id}/prescriptions`,
        "POST",
        { items },
      );
      setRx([{ medicineName: "", dosage: "", quantity: 1, ack: false }]);
      setData((d) => ({
        ...d,
        prescriptions: upsertById(d.prescriptions, prescription),
      }));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLabOrder() {
    const list = tests.map((t) => t.trim()).filter(Boolean);
    if (list.length === 0) return;
    setBusy(true);
    setMsg("");
    try {
      const { labOrder } = await apiSend(
        `/api/opd/consultations/${consultation.id}/lab-orders`,
        "POST",
        { tests: list },
      );
      setTests([""]);
      setData((d) => ({ ...d, labOrders: upsertById(d.labOrders, labOrder) }));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard/opd" className="text-sm text-slate-500 hover:underline">
          ← Queue
        </Link>
        <h1 className="mt-1 text-xl font-semibold">
          {visit.patient_name}{" "}
          <span className="text-sm font-normal text-slate-400">
            · {visit.patient_age}y · {visit.patient_phone}
          </span>
        </h1>
        {visit.reason && (
          <p className="text-sm text-slate-500">Reason: {visit.reason}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <AllergyBadge allergies={visit.patient_allergies} />
          {visit.patient_abha_id && (
            <span className="text-xs text-slate-400">ABHA: {visit.patient_abha_id}</span>
          )}
        </div>
      </div>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      {!consultation ? (
        <form
          onSubmit={saveConsultation}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
        >
          <p className="text-sm font-semibold">Consultation</p>
          {form ? (
            <DynamicForm
              fields={fields}
              values={values}
              onChange={(n, v) => setValues((s) => ({ ...s, [n]: v }))}
            />
          ) : (
            <p className="text-sm text-slate-400">Loading form…</p>
          )}
          <button
            disabled={busy || !form}
            className="rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
          >
            Save consultation
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Consultation recorded</p>
                {consultation.diagnosis && (
                  <p className="mt-1">Diagnosis: {consultation.diagnosis}</p>
                )}
                {consultation.notes && (
                  <p className="mt-1 text-slate-600">{consultation.notes}</p>
                )}
                <p className="mt-1 text-slate-500">Fee: {consultation.fee}</p>
              </div>
              {doctorUserId && (
                <button
                  onClick={() => {
                    setFollowUpMsg("");
                    setShowFollowUp(true);
                  }}
                  className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                >
                  Schedule follow-up
                </button>
              )}
            </div>
            {followUpMsg && <p className="mt-2 text-xs text-green-700">{followUpMsg}</p>}
          </div>

          {showFollowUp && doctorUserId && (
            <DoctorSlotPicker
              doctorUserId={doctorUserId}
              patientId={visit.patient_id}
              onClose={() => setShowFollowUp(false)}
              onBooked={() => {
                setShowFollowUp(false);
                setFollowUpMsg("Follow-up scheduled.");
              }}
            />
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold">Prescription → Pharmacy</p>
            {prescriptions.map((p) => (
              <div key={p.id} className="mt-2 rounded-md bg-slate-50 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    #{p.id} · {p.status}
                  </span>
                  <a
                    href={`/print/prescription/${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-600 underline"
                  >
                    Print →
                  </a>
                </div>
                <ul className="ml-4 list-disc">
                  {(p.items || []).map((it) => (
                    <li key={it.id}>
                      {it.medicine_name} {it.dosage} × {it.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="mt-3 space-y-2">
              {rxRows.map((r, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex gap-2">
                    <input
                      placeholder="medicine"
                      value={r.medicineName}
                      onChange={(e) =>
                        setRx((xs) =>
                          xs.map((x, j) =>
                            j === i ? { ...x, medicineName: e.target.value } : x,
                          ),
                        )
                      }
                      className={`flex-1 rounded-md border px-2 py-1 text-sm ${
                        r.match ? "border-red-300 bg-red-50" : "border-slate-300"
                      }`}
                    />
                    <input
                      placeholder="dosage"
                      value={r.dosage}
                      onChange={(e) =>
                        setRx((xs) =>
                          xs.map((x, j) =>
                            j === i ? { ...x, dosage: e.target.value } : x,
                          ),
                        )
                      }
                      className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                    <input
                      type="number"
                      min="1"
                      value={r.quantity}
                      onChange={(e) =>
                        setRx((xs) =>
                          xs.map((x, j) =>
                            j === i ? { ...x, quantity: e.target.value } : x,
                          ),
                        )
                      }
                      className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                  </div>
                  {r.match && (
                    <label className="flex items-center gap-1.5 pl-1 text-xs text-red-700">
                      <input
                        type="checkbox"
                        checked={r.ack}
                        onChange={(e) =>
                          setRx((xs) =>
                            xs.map((x, j) =>
                              j === i ? { ...x, ack: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                      ⚠ Matches declared allergy &quot;{r.match}&quot; — I acknowledge and want to prescribe anyway
                    </label>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setRx((xs) => [...xs, { medicineName: "", dosage: "", quantity: 1, ack: false }])
                  }
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  + row
                </button>
                <button
                  onClick={savePrescription}
                  disabled={busy || blockedByAllergy}
                  title={blockedByAllergy ? "Acknowledge the allergy warning first" : undefined}
                  className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1 text-xs text-[var(--hms-btn-fg)] disabled:opacity-50"
                >
                  Send to pharmacy
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold">Lab order → Lab</p>
            {labOrders.map((lo) => (
              <div key={lo.id} className="mt-2 rounded-md bg-slate-50 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    #{lo.id} · {lo.status}
                  </span>
                  {lo.status === "RESULTED" && (
                    <a
                      href={`/print/lab-report/${lo.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-600 underline"
                    >
                      Print →
                    </a>
                  )}
                </div>
                <p>{(parseJson(lo.tests) || []).join(", ")}</p>
              </div>
            ))}
            <div className="mt-3 space-y-2">
              {tests.map((t, i) => (
                <input
                  key={i}
                  placeholder="test name"
                  value={t}
                  onChange={(e) =>
                    setTests((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              ))}
              <div className="flex gap-2">
                <button
                  onClick={() => setTests((xs) => [...xs, ""])}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  + test
                </button>
                <button
                  onClick={saveLabOrder}
                  disabled={busy}
                  className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1 text-xs text-[var(--hms-btn-fg)] disabled:opacity-50"
                >
                  Send to lab
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function parseJson(v) {
  if (Array.isArray(v)) return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
