"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/components/hms/api";
import DynamicForm, { splitValues } from "@/components/hms/DynamicForm";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";
import DoctorSlotPicker from "@/components/hms/DoctorSlotPicker";
import { parseMaybeJson } from "@/components/hms/json";
import ExternalSend from "@/components/hms/ExternalSend";
import StockHint from "@/components/hms/StockHint";
import PatientHistorySidebar from "@/components/hms/PatientHistorySidebar";
import MedicineInput from "@/components/hms/MedicineInput";
import LabOrderPicker from "@/components/hms/LabOrderPicker";
import { FREQUENCIES, calcQuantity } from "@/lib/rxQuantity";
import { matchAllergy } from "@/lib/allergyCheck";

function upsertById(list, item) {
  return list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];
}

// Structured prescription entry — real medical terms, dropdown-first where
// the option set is genuinely fixed (form/frequency), free text only where
// it has to be (medicine name, dose strength, notes). `prescription_items`
// itself still only has medicine_name/dosage columns (see CLAUDE.md
// "dosage carries frequency+duration together, e.g. '1-0-1 × 5 days' — no
// separate columns for those") — these fields are composed into that same
// single `dosage` string before sending, so the API and the pharmacy-stock
// matching (which keys on medicine_name being byte-for-byte the same drug
// name a pharmacist stocked in) are completely unchanged.
function emptyRxRow() {
  return { medicineName: "", dose: "1", frequency: "OD", customFrequency: "", days: "5", notes: "", quantity: "", overrideQty: false, overrideReason: "", ack: false };
}

/** The one place a row becomes the single `dosage` string the API stores (e.g. "1 BD (Twice daily) × 5 days · after food"). */
function composeDosage(r) {
  const f = FREQUENCIES.find((x) => x.code === r.frequency);
  const freqText = r.frequency === "CUSTOM" ? r.customFrequency.trim() : f ? `${f.code} (${f.short})` : "";
  const dur = r.frequency === "STAT" || r.frequency === "SOS" || !String(r.days).trim() ? "" : `× ${r.days} day${Number(r.days) === 1 ? "" : "s"}`;
  const reason = r.overrideQty && r.overrideReason.trim() ? `qty changed: ${r.overrideReason.trim()}` : "";
  return [[r.dose.trim(), freqText, dur].filter(Boolean).join(" "), r.notes.trim(), reason].filter(Boolean).join(" · ");
}

/** Final quantity for a row: the calculated one, unless the doctor deliberately overrode it. */
function rowQuantity(r) {
  const calc = calcQuantity({ dose: r.dose, frequency: r.frequency, days: r.days });
  if (r.overrideQty || calc.qty == null) return { qty: Number(r.quantity) || 0, calc };
  return { qty: calc.qty, calc };
}

export default function ConsultationClient({ visitId, doctorUserId }) {
  const [data, setData] = useState(null); // { visit, consultation, prescriptions, labOrders, radiologyOrders }
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  const [rx, setRx] = useState([emptyRxRow()]);
  const [studyName, setStudyName] = useState("");
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
      "radiologyorder:created": ({ radiologyOrder }) =>
        setData((d) =>
          d && d.consultation && radiologyOrder.consultationId === d.consultation.id
            ? { ...d, radiologyOrders: upsertById(d.radiologyOrders, radiologyOrder) }
            : d,
        ),
      "radiologyorder:updated": ({ radiologyOrder }) =>
        setData((d) =>
          d && d.consultation && radiologyOrder.consultationId === d.consultation.id
            ? { ...d, radiologyOrders: upsertById(d.radiologyOrders, radiologyOrder) }
            : d,
        ),
    },
    load,
  );

  if (!data) {
    return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;
  }

  const { visit, consultation, prescriptions, labOrders, radiologyOrders } = data;
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
        ...(core.fee !== undefined && core.fee !== "" ? { fee: core.fee } : {}),
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
  const blockedByQty = rxRows.some((r) => r.medicineName.trim() && (rowQuantity(r).qty < 1 || (r.overrideQty && !r.overrideReason.trim())));

  async function savePrescription() {
    if (blockedByAllergy || blockedByQty) return;
    const items = rx
      .filter((r) => r.medicineName.trim())
      .map((r) => ({
        medicineName: r.medicineName.trim(),
        dosage: composeDosage(r),
        quantity: rowQuantity(r).qty || 1,
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
      setRx([emptyRxRow()]);
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

  async function saveRadiologyOrder() {
    const study = studyName.trim();
    if (!study) return;
    setBusy(true);
    setMsg("");
    try {
      const { radiologyOrder } = await apiSend(
        `/api/opd/consultations/${consultation.id}/radiology-orders`,
        "POST",
        { studyName: study },
      );
      setStudyName("");
      setData((d) => ({ ...d, radiologyOrders: upsertById(d.radiologyOrders, radiologyOrder) }));
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem]">
    <div className="min-w-0 space-y-6">
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

      {doctorUserId && (
        <div>
          <button
            onClick={() => {
              setFollowUpMsg("");
              setShowFollowUp(true);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            Schedule a future appointment
          </button>
          {followUpMsg && <span className="ml-2 text-xs text-green-700">{followUpMsg}</span>}
        </div>
      )}

      {showFollowUp && doctorUserId && (
        <DoctorSlotPicker
          doctorUserId={doctorUserId}
          patientId={visit.patient_id}
          onClose={() => setShowFollowUp(false)}
          onBooked={() => {
            setShowFollowUp(false);
            setFollowUpMsg("Appointment scheduled.");
          }}
        />
      )}

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
                {Number(consultation.fee) > 0 && <p className="mt-1 text-slate-500">Fee: {consultation.fee}</p>}
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
                      <ExternalSend type="PHARMACY" url={`/api/pharmacy/prescriptions/${p.id}/items/${it.id}/send-external`} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="mt-3 space-y-3">
              {rxRows.map((r, i) => {
                function update(patch) {
                  setRx((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                }
                const { qty, calc } = rowQuantity(r);
                const noCalc = calc.qty == null;
                const needsReason = r.overrideQty && !r.overrideReason.trim();
                return (
                  <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500">Medicine</label>
                      <MedicineInput
                        endpoint="/api/opd/medicine-suggest"
                        value={r.medicineName}
                        onChange={(t) => update({ medicineName: t })}
                        placeholder="Start typing — e.g. Cap Cefixime 200 mg"
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-sm ${r.match ? "border-red-300 bg-red-50" : "border-slate-300 bg-white"}`}
                      />
                      <StockHint query={r.medicineName} onPick={(name) => update({ medicineName: name })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500">Dose</label>
                        <input placeholder="1 capsule" value={r.dose} onChange={(e) => update({ dose: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm" />
                        <span className="text-[10px] text-slate-400">Units per intake</span>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500">Frequency</label>
                        <select value={r.frequency} onChange={(e) => update({ frequency: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
                          {FREQUENCIES.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
                        </select>
                        {r.frequency === "CUSTOM" && (
                          <input placeholder="e.g. alternate days" value={r.customFrequency} onChange={(e) => update({ customFrequency: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm" />
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500">Duration (days)</label>
                        <input type="number" min="1" placeholder="5" disabled={r.frequency === "STAT"} value={r.days} onChange={(e) => update({ days: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm disabled:bg-slate-100" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500">Calculated Quantity</label>
                        {noCalc || r.overrideQty ? (
                          <input type="number" min="1" placeholder="Enter quantity" value={r.quantity} onChange={(e) => update({ quantity: e.target.value })} aria-label="Quantity" className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm" />
                        ) : (
                          <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-sm font-semibold text-emerald-800" aria-label="Calculated quantity">{qty}</p>
                        )}
                        <span className="text-[10px] text-slate-400">{r.overrideQty ? "Changed by doctor" : noCalc ? "Cannot be calculated — enter it" : calc.formula}</span>
                      </div>
                    </div>
                    {!noCalc && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <label className="flex items-center gap-1.5 text-slate-600">
                          <input type="checkbox" checked={r.overrideQty} onChange={(e) => update({ overrideQty: e.target.checked, quantity: e.target.checked ? String(calc.qty) : "" })} />
                          Change quantity
                        </label>
                        {r.overrideQty && (
                          <input placeholder="Reason for changing (required)" value={r.overrideReason} onChange={(e) => update({ overrideReason: e.target.value })} className={`min-w-[14rem] flex-1 rounded-lg border px-2.5 py-1 ${needsReason ? "border-red-300" : "border-slate-300"}`} />
                        )}
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500">Instructions (optional)</label>
                      <input placeholder="e.g. after food" value={r.notes} onChange={(e) => update({ notes: e.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm" />
                    </div>
                    {r.match && (
                      <label className="flex items-center gap-1.5 pl-1 text-xs text-red-700">
                        <input type="checkbox" checked={r.ack} onChange={(e) => update({ ack: e.target.checked })} />
                        ⚠ Matches declared allergy &quot;{r.match}&quot; — I acknowledge and want to prescribe anyway
                      </label>
                    )}
                    <p className="text-[11px] text-slate-400">Will be recorded as: {r.medicineName || "—"} · {composeDosage(r) || "—"} · Qty {qty || "—"}</p>
                  </div>
                );
              })}
              <div className="flex gap-2">
                <button
                  onClick={() => setRx((xs) => [...xs, emptyRxRow()])}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  + row
                </button>
                <button
                  onClick={savePrescription}
                  disabled={busy || blockedByAllergy || blockedByQty}
                  title={blockedByAllergy ? "Acknowledge the allergy warning first" : blockedByQty ? "Check quantity / reason for each medicine" : undefined}
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
                {lo.status === "ORDERED" && <ExternalSend type="LAB" url={`/api/lab/orders/${lo.id}/send-external`} />}
              </div>
            ))}
            <LabOrderPicker
              consultationId={consultation.id}
              onError={setMsg}
              onOrdered={(labOrder) => setData((d) => ({ ...d, labOrders: upsertById(d.labOrders, labOrder) }))}
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold">Radiology order → Radiology</p>
            {radiologyOrders.map((ro) => (
              <div key={ro.id} className="mt-2 rounded-md bg-slate-50 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    #{ro.id} · {ro.status}
                  </span>
                </div>
                <p>{ro.studyName}</p>
                {ro.status === "COMPLETED" && ro.impression && (
                  <p className="mt-1 text-xs text-slate-500">Impression: {ro.impression}</p>
                )}
              </div>
            ))}
            <div className="mt-3 flex gap-2">
              <input
                placeholder="study name, e.g. Chest X-Ray"
                value={studyName}
                onChange={(e) => setStudyName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <button
                onClick={saveRadiologyOrder}
                disabled={busy}
                className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1 text-xs text-[var(--hms-btn-fg)] disabled:opacity-50"
              >
                Order radiology
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    <PatientHistorySidebar patientId={visit.patient_id} currentVisitId={visit.id} />
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
