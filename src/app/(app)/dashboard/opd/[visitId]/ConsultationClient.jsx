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
import PatientHistory from "@/components/hms/PatientHistory";
import { LAB_TEST_GROUPS } from "@/lib/labTestCatalog";
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
const MEDICINE_FORMS = ["Tablet", "Capsule", "Syrup", "Injection", "Cream/Ointment", "Drops", "Inhaler", "Powder", "Other"];
const FREQUENCIES = [
  { code: "OD", label: "OD — Once a day" },
  { code: "BD", label: "BD — Twice a day" },
  { code: "TID", label: "TID — Three times a day" },
  { code: "QID", label: "QID — Four times a day" },
  { code: "HS", label: "HS — At bedtime" },
  { code: "SOS", label: "SOS — As needed" },
  { code: "STAT", label: "STAT — Immediately, once" },
  { code: "CUSTOM", label: "Custom…" },
];

function emptyRxRow() {
  return { form: "Tablet", medicineName: "", dose: "", frequency: "OD", customFrequency: "", notes: "", quantity: 1, ack: false };
}

/** The one place a row's Type/Dose/Frequency/Notes become the single `dosage` string the API expects — matches this project's existing convention exactly (e.g. "20mg BD (Twice a day)"), just with the form and notes layered on. */
function composeDosage(r) {
  const freq = r.frequency === "CUSTOM" ? r.customFrequency.trim() : FREQUENCIES.find((f) => f.code === r.frequency);
  const freqText = r.frequency === "CUSTOM" ? freq : freq ? `${freq.code} (${freq.label.split("— ")[1]})` : "";
  return [r.form, [r.dose.trim(), freqText].filter(Boolean).join(" "), r.notes.trim()]
    .filter(Boolean)
    .join(" · ");
}

export default function ConsultationClient({ visitId, doctorUserId }) {
  const [data, setData] = useState(null); // { visit, consultation, prescriptions, labOrders, radiologyOrders }
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  const [rx, setRx] = useState([emptyRxRow()]);
  const [tests, setTests] = useState([""]);
  const [studyName, setStudyName] = useState("");
  const [labCatalog, setLabCatalog] = useState([]); // this facility's own priced tests
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

  async function savePrescription() {
    if (blockedByAllergy) return;
    const items = rx
      .filter((r) => r.medicineName.trim())
      .map((r) => ({
        medicineName: r.medicineName.trim(),
        dosage: composeDosage(r),
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

  useEffect(() => {
    apiGet("/api/lab/catalog").then((d) => setLabCatalog(d.tests || [])).catch(() => {});
  }, []);

  async function saveLabOrder() {
    const list = tests.map((t) => t.trim()).filter(Boolean);
    if (list.length === 0) return;
    setBusy(true);
    setMsg("");
    try {
      const { labOrder } = await apiSend(
        `/api/opd/consultations/${consultation.id}/lab-orders`,
        "POST",
        { tests: list.map((name) => { const hit = labCatalog.find((c) => c.name.toLowerCase() === name.toLowerCase()); return hit ? { name, serviceId: hit.serviceId } : name; }) },
      );
      setTests([""]);
      setData((d) => ({ ...d, labOrders: upsertById(d.labOrders, labOrder) }));
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

      <PatientHistory patientId={visit.patient_id} currentVisitId={visit.id}>
        {doctorUserId && (
          <div className="mt-2">
            <button
              onClick={() => {
                setFollowUpMsg("");
                setShowFollowUp(true);
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              Schedule a future appointment
            </button>
            {followUpMsg && <span className="ml-2 text-xs text-green-700">{followUpMsg}</span>}
          </div>
        )}
      </PatientHistory>

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
                return (
                  <div key={i} className="space-y-2 rounded-md border border-slate-200 p-2.5">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <div>
                        <label className="block text-[11px] text-slate-500">Type</label>
                        <select
                          value={r.form}
                          onChange={(e) => update({ form: e.target.value })}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        >
                          {MEDICINE_FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-[11px] text-slate-500">Medicine name</label>
                        <input
                          placeholder="e.g. Omeprazole"
                          value={r.medicineName}
                          onChange={(e) => update({ medicineName: e.target.value })}
                          className={`w-full rounded-md border px-2 py-1 text-sm ${
                            r.match ? "border-red-300 bg-red-50" : "border-slate-300"
                          }`}
                        />
                        <StockHint query={r.medicineName} onPick={(name) => update({ medicineName: name })} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500">Dose</label>
                        <input
                          placeholder="e.g. 20mg"
                          value={r.dose}
                          onChange={(e) => update({ dose: e.target.value })}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500">Frequency</label>
                        <select
                          value={r.frequency}
                          onChange={(e) => update({ frequency: e.target.value })}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        >
                          {FREQUENCIES.map((f) => <option key={f.code} value={f.code}>{f.label}</option>)}
                        </select>
                        {r.frequency === "CUSTOM" && (
                          <input
                            placeholder="e.g. 1-0-1 × 5 days"
                            value={r.customFrequency}
                            onChange={(e) => update({ customFrequency: e.target.value })}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500">Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={r.quantity}
                          onChange={(e) => update({ quantity: e.target.value })}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500">Notes (optional)</label>
                      <input
                        placeholder="e.g. after food"
                        value={r.notes}
                        onChange={(e) => update({ notes: e.target.value })}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                    </div>
                    {r.match && (
                      <label className="flex items-center gap-1.5 pl-1 text-xs text-red-700">
                        <input type="checkbox" checked={r.ack} onChange={(e) => update({ ack: e.target.checked })} />
                        ⚠ Matches declared allergy &quot;{r.match}&quot; — I acknowledge and want to prescribe anyway
                      </label>
                    )}
                    <p className="text-[11px] text-slate-400">Will be recorded as: {composeDosage(r) || "—"}</p>
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
                {lo.status === "ORDERED" && <ExternalSend type="LAB" url={`/api/lab/orders/${lo.id}/send-external`} />}
              </div>
            ))}
            <div className="mt-3 space-y-2">
              <select
                aria-label="Add a common test"
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  setTests((xs) => (xs.includes(v) ? xs : xs.some((x) => !x.trim()) ? xs.map((x, k) => (k === xs.findIndex((y) => !y.trim()) ? v : x)) : [...xs, v]));
                }}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="">Add a common test…</option>
                {labCatalog.length > 0 && (
                  <optgroup label="Our lab (priced)">
                    {labCatalog.map((t) => <option key={t.id} value={t.name}>{t.name}{t.price != null ? ` — ₹${t.price}` : ""}</option>)}
                  </optgroup>
                )}
                {Object.entries(LAB_TEST_GROUPS).map(([g, list]) => (
                  <optgroup key={g} label={g}>
                    {list.map((t) => <option key={t} value={t}>{t}</option>)}
                  </optgroup>
                ))}
              </select>
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
