"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import RadiologyOrderPicker from "@/components/hms/RadiologyOrderPicker";
import { CONTRAST_LABEL } from "@/lib/radiologyCommon";
import { FREQUENCIES, calcQuantity, parseDosage } from "@/lib/rxQuantity";
import { matchAllergy } from "@/lib/allergyCheck";
import { rxStatusForDoctor } from "@/lib/rxStatus";

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
  const [pharmacies, setPharmacies] = useState([]); // where this prescription can go
  const [pharmacyId, setPharmacyId] = useState("");
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);
  const [sentNote, setSentNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpMsg, setFollowUpMsg] = useState("");
  const [editing, setEditing] = useState(false);

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

  useEffect(() => {
    apiGet("/api/opd/destinations")
      .then((d) => {
        setPharmacies(d.pharmacies || []);
        if ((d.pharmacies || []).length) setPharmacyId(d.pharmacies[0].id);
      })
      .catch(() => {});
  }, []);

  if (!data) {
    return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;
  }

  const chosenPharmacy = pharmacies.find((ph) => ph.id === pharmacyId) || null;

  const { visit, consultation, prescriptions, labOrders, radiologyOrders } = data;
  const closed = visit.status === "DISCHARGED";
  const pendingLab = labOrders.filter((l) => l.status !== "RESULTED" && l.status !== "CANCELLED").length;
  const pendingRad = radiologyOrders.filter((r) => !["COMPLETED", "CANCELLED"].includes(r.status)).length;
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
      if (chosenPharmacy && !chosenPharmacy.own) {
        // A partner pharmacy receives each medicine by name.
        const full = (await apiGet(`/api/opd/visits/${visitId}`)).prescriptions.find((x) => x.id === prescription.id)?.items || [];
        for (const it of full) {
          await apiSend(`/api/pharmacy/prescriptions/${prescription.id}/items/${it.id}/send-external`, "POST", { providerId: Number(chosenPharmacy.id) });
        }
      }
      setSentNote(chosenPharmacy ? `Sent to ${chosenPharmacy.name}.` : "Saved. Print it for the patient.");
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

  function startEdit() {
    const custom = parseMaybeJson(consultation.custom_fields) || {};
    setValues({ ...custom, notes: consultation.notes || "", diagnosis: consultation.diagnosis || "" });
    setEditing(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const { core, custom } = splitValues(form, values);
      const { consultation: updated } = await apiSend(`/api/opd/consultations/${consultation.id}`, "PATCH", {
        notes: core.notes || "",
        diagnosis: core.diagnosis || "",
        customFields: custom,
      });
      setData((d) => ({ ...d, consultation: updated }));
      setValues({});
      setEditing(false);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reopenVisit() {
    setMsg("");
    try {
      await apiSend(`/api/registration/visits/${visitId}`, "PATCH", { status: "WITH_DOCTOR" });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  // Repeat medicines from an earlier prescription as editable rows — the doctor changes the two or
  // three that differ and removes the rest, instead of typing all of them again.
  function addFromPast(meds) {
    const rows = meds.map((m) => {
      const p = parseDosage(m.dosage);
      const row = { ...emptyRxRow(), medicineName: m.name, ...p };
      const calc = calcQuantity(row);
      if (calc.qty == null) row.quantity = String(m.quantity);
      else if (calc.qty !== Number(m.quantity)) return { ...row, overrideQty: true, quantity: String(m.quantity), overrideReason: "repeated from earlier prescription" };
      return row;
    });
    setRx((xs) => {
      const kept = xs.filter((r) => r.medicineName.trim());
      const have = new Set(kept.map((r) => r.medicineName.trim().toLowerCase()));
      return [...kept, ...rows.filter((r) => !have.has(r.medicineName.trim().toLowerCase()))];
    });
    setSentNote("");
  }

  async function finishVisit() {
    if (!confirm("Finish this visit? The patient will be removed from the doctor's queue.")) return;
    setFinishing(true);
    setMsg("");
    try {
      await apiSend(`/api/registration/visits/${visitId}`, "PATCH", { status: "DISCHARGED" });
      router.push("/dashboard/opd");
    } catch (err) {
      setMsg(err.message);
      setFinishing(false);
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

      <div className="flex flex-wrap items-center gap-2">
        {closed ? (
          <>
            <button onClick={reopenVisit} className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-600">Reopen visit</button>
            <span className="text-[11px] text-slate-400">This visit is finished. Reopen it if the patient is back with reports or needs more.</span>
          </>
        ) : (
          <>
            <button onClick={finishVisit} disabled={finishing || !consultation} title={consultation ? "Completes the visit and removes it from the queue" : "Save the consultation first"} className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40">{finishing ? "Finishing…" : "Finish visit"}</button>
            <span className="text-[11px] text-slate-400">
              {pendingLab + pendingRad > 0
                ? `${pendingLab ? `${pendingLab} lab` : ""}${pendingLab && pendingRad ? " and " : ""}${pendingRad ? `${pendingRad} imaging` : ""} report(s) still pending — you can finish now and reopen the visit when the patient returns with them.`
                : "No tests pending. Click when the patient is done — the queue then shows the next patient."}
            </span>
          </>
        )}
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
          {editing && (
            <form onSubmit={saveEdit} className="space-y-4 rounded-lg border border-amber-300 bg-white p-4">
              <p className="text-sm font-semibold">Edit consultation</p>
              <p className="text-xs text-slate-500">Add the report findings or correct the notes. The fee stays as it was.</p>
              {form && <DynamicForm fields={fields.filter((f) => f.fieldName !== "fee")} values={values} onChange={(n, v) => setValues((s) => ({ ...s, [n]: v }))} />}
              <div className="flex gap-2">
                <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Save changes</button>
                <button type="button" onClick={() => { setEditing(false); setValues({}); }} className="rounded-md border border-slate-300 px-4 py-2 text-sm">Cancel</button>
              </div>
            </form>
          )}
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
              <div className="flex shrink-0 gap-2">
                <button onClick={startEdit} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Edit</button>
                {doctorUserId && (
                  <button
                    onClick={() => {
                      setFollowUpMsg("");
                      setShowFollowUp(true);
                    }}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                  >
                    Schedule follow-up
                  </button>
                )}
              </div>
            </div>
            {followUpMsg && <p className="mt-2 text-xs text-green-700">{followUpMsg}</p>}
          </div>


          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold">Prescription → Pharmacy</p>
            {prescriptions.map((p) => (
              <div key={p.id} className="mt-2 rounded-md bg-slate-50 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    #{p.id} · {rxStatusForDoctor(p.status)}
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
            <div className="mt-2 space-y-1.5">
              <div className="hidden gap-1.5 px-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 md:grid md:grid-cols-[minmax(0,1fr)_5.5rem_6rem_4rem_4.5rem_1.5rem]">
                <span>Medicine</span><span>Dose</span><span>Frequency</span><span>Days</span><span>Qty</span><span />
              </div>
              {rxRows.map((r, i) => {
                function update(patch) {
                  setRx((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                }
                const { qty, calc } = rowQuantity(r);
                const noCalc = calc.qty == null;
                const needsReason = r.overrideQty && !r.overrideReason.trim();
                const cell = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm md:px-2";
                return (
                  <div key={i} className={`rounded-lg border px-2 py-1.5 ${r.match ? "border-red-300 bg-red-50/60" : "border-slate-200 bg-slate-50/60"}`}>
                    <div className="relative grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem_2.75rem] items-center gap-1.5 md:grid-cols-[minmax(0,1fr)_5.5rem_6rem_4rem_4.5rem_1.5rem]">
                      <div className="col-span-4 pr-5 md:col-span-1 md:pr-0">
                        <MedicineInput
                          endpoint="/api/opd/medicine-suggest"
                          value={r.medicineName}
                          onChange={(t) => update({ medicineName: t })}
                          placeholder="Medicine — e.g. Cap Cefixime 200 mg"
                          className={`${cell} ${r.match ? "border-red-300" : ""}`}
                        />
                      </div>
                      <input aria-label="Dose" title="Units per intake" placeholder="1" value={r.dose} onChange={(e) => update({ dose: e.target.value })} className={cell} />
                      <select aria-label="Frequency" title={FREQUENCIES.find((f) => f.code === r.frequency)?.label} value={r.frequency} onChange={(e) => update({ frequency: e.target.value })} className={cell}>
                        {FREQUENCIES.map((f) => <option key={f.code} value={f.code} title={f.label}>{f.code === "CUSTOM" ? "Custom…" : f.code}</option>)}
                      </select>
                      <input aria-label="Days" type="number" min="1" placeholder="Days" disabled={r.frequency === "STAT"} value={r.days} onChange={(e) => update({ days: e.target.value })} className={`${cell} disabled:bg-slate-100`} />
                      {noCalc || r.overrideQty ? (
                        <input aria-label="Quantity" type="number" min="1" placeholder="Qty" value={r.quantity} onChange={(e) => update({ quantity: e.target.value })} className={`${cell} ${r.overrideQty ? "border-amber-400" : ""}`} />
                      ) : (
                        <button type="button" onClick={() => update({ overrideQty: true, quantity: String(calc.qty) })} title={`${calc.formula} — click to change`} className="rounded-md bg-emerald-50 px-2 py-1 text-center text-sm font-semibold text-emerald-800 hover:bg-emerald-100" aria-label="Calculated quantity">{qty}</button>
                      )}
                      <button type="button" aria-label="Remove medicine" title="Remove" onClick={() => setRx((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : [emptyRxRow()]))} className="absolute right-0 top-0 text-base leading-none text-slate-400 hover:text-red-600 md:static md:justify-self-end">×</button>
                    </div>
                    {r.frequency === "CUSTOM" && (
                      <input placeholder="Frequency — e.g. alternate days" value={r.customFrequency} onChange={(e) => update({ customFrequency: e.target.value })} className={`${cell} mt-1.5`} />
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <input aria-label="Instructions" placeholder="Instructions (optional) — e.g. after food" value={r.notes} onChange={(e) => update({ notes: e.target.value })} className="min-w-[10rem] flex-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs" />
                      {r.overrideQty ? (
                        <>
                          <input placeholder="Reason for changing qty (required)" value={r.overrideReason} onChange={(e) => update({ overrideReason: e.target.value })} className={`min-w-[10rem] flex-1 rounded-md border bg-white px-2 py-0.5 text-xs ${needsReason ? "border-red-300" : "border-slate-200"}`} />
                          {!noCalc && <button type="button" onClick={() => update({ overrideQty: false, overrideReason: "", quantity: "" })} className="text-[11px] text-slate-500 underline">use calculated ({calc.qty})</button>}
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-400">{noCalc ? "Enter the quantity" : calc.formula}</span>
                      )}
                    </div>
                    {r.match && (
                      <label className="mt-1 flex items-center gap-1.5 text-[11px] text-red-700">
                        <input type="checkbox" checked={r.ack} onChange={(e) => update({ ack: e.target.checked })} />
                        ⚠ Matches declared allergy &quot;{r.match}&quot; — acknowledge and prescribe anyway
                      </label>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={() => setRx((xs) => [...xs, emptyRxRow()])} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">+ Medicine</button>
                <span className="ml-auto text-[11px] text-slate-500">To</span>
                {pharmacies.length === 0 ? (
                  <span className="text-[11px] text-amber-700">No pharmacy connected — save &amp; print</span>
                ) : pharmacies.length === 1 ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{pharmacies[0].name}</span>
                ) : (
                  <select aria-label="Pharmacy" value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
                    {pharmacies.map((ph) => <option key={ph.id} value={ph.id}>{ph.name}{ph.own ? "" : " (partner)"}</option>)}
                  </select>
                )}
                <button
                  onClick={savePrescription}
                  disabled={busy || blockedByAllergy || blockedByQty}
                  title={blockedByAllergy ? "Acknowledge the allergy warning first" : blockedByQty ? "Check quantity / reason for each medicine" : undefined}
                  className="rounded-md bg-[var(--hms-btn-bg)] px-3.5 py-1 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
                >
                  {chosenPharmacy ? "Send" : "Save"}
                </button>
                {sentNote && <span className="w-full text-xs text-emerald-700">{sentNote}</span>}
              </div>
            </div>
          </div>

          <details open={labOrders.length > 0} className="group rounded-lg border border-slate-200 bg-white [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="text-slate-400 transition group-open:rotate-90">▶</span>
                Lab order → Lab
              </span>
              {labOrders.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{labOrders.length}</span>}
            </summary>
            <div className="px-4 pb-4">
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
                {lo.status === "RESULTED" && (parseJson(lo.results) || []).length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                    {(parseJson(lo.results) || []).map((r, i) => (
                      <li key={i}>{r.testName}: <span className={r.flag && r.flag !== "NORMAL" ? "font-semibold text-red-600" : "font-medium"}>{r.result}{r.units ? ` ${r.units}` : ""}</span>{r.flag && r.flag !== "NORMAL" ? ` (${r.flag.toLowerCase()})` : ""}</li>
                    ))}
                  </ul>
                )}
                {lo.status === "ORDERED" && <ExternalSend type="LAB" url={`/api/lab/orders/${lo.id}/send-external`} />}
              </div>
            ))}
            <LabOrderPicker
              consultationId={consultation.id}
              onError={setMsg}
              onOrdered={(labOrder) => setData((d) => ({ ...d, labOrders: upsertById(d.labOrders, labOrder) }))}
            />
            </div>
          </details>

          <details open={radiologyOrders.length > 0} className="group rounded-lg border border-slate-200 bg-white [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="text-slate-400 transition group-open:rotate-90">▶</span>
                Imaging order → Radiology
              </span>
              {radiologyOrders.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{radiologyOrders.length}</span>}
            </summary>
            <div className="px-4 pb-4">
            {radiologyOrders.map((ro) => (
              <div key={ro.id} className="mt-2 rounded-md bg-slate-50 p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">#{ro.id} · {ro.status}{ro.priority && ro.priority !== "ROUTINE" ? ` · ${ro.priority}` : ""}</span>
                  <span className="flex gap-3 text-xs">
                    <a href={`/print/radiology-order/${ro.id}`} target="_blank" rel="noopener noreferrer" className="text-slate-600 underline">Print requisition</a>
                    {ro.status === "COMPLETED" && <a href={`/print/radiology-report/${ro.id}`} target="_blank" rel="noopener noreferrer" className="text-slate-600 underline">Print report</a>}
                  </span>
                </div>
                <p>{ro.modality ? <b className="font-semibold">{ro.modality} </b> : null}{ro.studyName}{ro.laterality && ro.laterality !== "NA" ? ` (${ro.laterality.toLowerCase()})` : ""}{ro.contrast ? ` · ${CONTRAST_LABEL[ro.contrast] || ro.contrast}` : ""}</p>
                {ro.clinicalIndication && <p className="text-xs text-slate-500">Why: {ro.clinicalIndication}</p>}
                {ro.status === "COMPLETED" && ro.impression && (
                  <p className="mt-1 text-xs text-slate-500">Impression: {ro.impression}</p>
                )}
              </div>
            ))}
            <RadiologyOrderPicker
              consultationId={consultation.id}
              patient={{ age: visit.patient_age, gender: visit.patient_gender }}
              onError={setMsg}
              onOrdered={(radiologyOrder) => setData((d) => ({ ...d, radiologyOrders: upsertById(d.radiologyOrders, radiologyOrder) }))}
            />
            </div>
          </details>
        </div>
      )}
    </div>
    <PatientHistorySidebar patientId={visit.patient_id} currentVisitId={visit.id} onUseMedicines={consultation ? addFromPast : undefined} />
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
