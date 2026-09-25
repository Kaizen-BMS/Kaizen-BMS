"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import { MEDICINE_TYPES, SCHEDULES } from "@/lib/medicineTypes";
import { composeMedicineName } from "@/lib/medicineName";
import BarcodeScanner from "@/components/hms/BarcodeScanner";

const input = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";

function Field({ label, help, children, className = "" }) {
  return (
    <label className={`block text-xs font-medium text-slate-600 ${className}`}>
      {label}
      <div className="mt-1">{children}</div>
      {help && <span className="mt-0.5 block text-[11px] font-normal leading-tight text-slate-400">{help}</span>}
    </label>
  );
}

const BLANK = {
  baseName: "", medicineType: "Tablet", strength: "", genericName: "", brandName: "", composition: "", manufacturer: "",
  category: "", schedule: "", prescriptionRequired: false, barcode: "", hsnCode: "", gstRate: "0", packSize: "", unit: "", purchaseUnit: "", unitsPerPurchase: "1",
  reorderLevel: "10", maxStock: "", location: "",
};

function toForm(m) {
  return {
    baseName: m.baseName || m.name, medicineType: m.medicineType || "Other", strength: m.strength || "", genericName: m.genericName || "",
    brandName: m.brandName || "", composition: m.composition || "", manufacturer: m.manufacturer || "", category: m.category || "",
    schedule: m.schedule || "", prescriptionRequired: !!m.prescriptionRequired, barcode: m.barcode || "", hsnCode: m.hsnCode || "",
    gstRate: String(m.gstRate ?? 0), packSize: m.packSize || "", unit: m.unit || "", purchaseUnit: m.purchaseUnit || "", unitsPerPurchase: String(m.unitsPerPurchase ?? 1), reorderLevel: String(m.reorderLevel ?? 10),
    maxStock: m.maxStock != null ? String(m.maxStock) : "", location: [m.rack, m.shelf, m.bin].filter(Boolean).join(" - "),
  };
}

function toPayload(f, editing, orig) {
  // Editing: the display name is only re-composed if the name/type/strength really changed.
  const identityUnchanged = editing && orig && orig.baseName === f.baseName && orig.medicineType === f.medicineType && orig.strength === f.strength;
  return {
    ...(identityUnchanged ? {} : { baseName: f.baseName, medicineType: f.medicineType, strength: f.strength }),
    genericName: f.genericName, brandName: f.brandName,
    composition: f.composition, manufacturer: f.manufacturer, category: f.category, schedule: f.schedule,
    prescriptionRequired: !!f.prescriptionRequired, barcode: f.barcode, hsnCode: f.hsnCode, gstRate: Number(f.gstRate || 0),
    packSize: f.packSize, unit: f.unit, purchaseUnit: f.purchaseUnit, unitsPerPurchase: Number(f.unitsPerPurchase || 1), reorderLevel: Number(f.reorderLevel || 10),
    ...(f.maxStock ? { maxStock: Number(f.maxStock) } : {}),
    // One free-text Location ("Rack A - Shelf 3"); the separate shelf/bin boxes are retired from the UI.
    rack: f.location, ...(editing ? { shelf: "", bin: "" } : {}),
  };
}

function MedicineForm({ f, setF, onScan }) {
  const preview = f.baseName ? composeMedicineName(f.medicineType, f.baseName, f.strength) : "";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Medicine Name" help="Just the name, e.g. Betadine." className="lg:col-span-1">
        <input required placeholder="Betadine" value={f.baseName} onChange={(e) => setF({ ...f, baseName: e.target.value })} className={input} />
      </Field>
      <Field label="Medicine Type" help="Tablet, Capsule, Syrup…">
        <select value={f.medicineType} onChange={(e) => setF({ ...f, medicineType: e.target.value })} className={input}>
          {MEDICINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Strength" help="As printed on the pack, e.g. 500 mg or 200 mg/5ml.">
        <input placeholder="500 mg" value={f.strength} onChange={(e) => setF({ ...f, strength: e.target.value })} className={input} />
      </Field>
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 sm:col-span-2 lg:col-span-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">This medicine will appear everywhere as</p>
        <p className="text-base font-semibold">{preview || "Cap Betadine 500 mg"}</p>
      </div>
      <Field label="Generic / Salt" help="The active ingredient."><input placeholder="Povidone Iodine" value={f.genericName} onChange={(e) => setF({ ...f, genericName: e.target.value })} className={input} /></Field>
      <Field label="Brand" help="Company brand name, if different."><input placeholder="Betadine" value={f.brandName} onChange={(e) => setF({ ...f, brandName: e.target.value })} className={input} /></Field>
      <Field label="Composition" help="Full composition, if you want it searchable."><input placeholder="Povidone Iodine 5% w/w" value={f.composition} onChange={(e) => setF({ ...f, composition: e.target.value })} className={input} /></Field>
      <Field label="Manufacturer" help="Who makes it."><input placeholder="ABC Pharma" value={f.manufacturer} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} className={input} /></Field>
      <Field label="Category" help="E.g. Antiseptic, Analgesic."><input placeholder="Antiseptic" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={input} /></Field>
      <Field label="Schedule" help="Drug schedule printed on the pack (H, H1, X…).">
        <select value={f.schedule} onChange={(e) => setF({ ...f, schedule: e.target.value })} className={input}>
          <option value="">— none / not sure —</option>
          {SCHEDULES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Prescription Required" help="Yes = cannot be sold without a prescription.">
        <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
          {[[true, "Yes"], [false, "No"]].map(([v, l]) => (
            <button key={l} type="button" onClick={() => setF({ ...f, prescriptionRequired: v })} className={`flex-1 px-3 py-1.5 ${f.prescriptionRequired === v ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-white text-slate-500"}`}>{l}</button>
          ))}
        </div>
      </Field>
      <Field label="Barcode" help="Scan or type the pack barcode (optional).">
        <div className="flex gap-1">
          <input placeholder="8901234567890" value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })} className={input} />
          <button type="button" onClick={onScan} className="shrink-0 rounded-lg border border-slate-300 px-3 text-xs hover:bg-slate-50">Scan</button>
        </div>
      </Field>
      <Field label="HSN Code" help="Tax classification code (optional)."><input placeholder="3004" value={f.hsnCode} onChange={(e) => setF({ ...f, hsnCode: e.target.value })} className={input} /></Field>
      <Field label="GST Rate" help="Tax charged when this medicine is sold.">
        <select value={f.gstRate} onChange={(e) => setF({ ...f, gstRate: e.target.value })} className={input}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</select>
      </Field>
      <Field label="Pack Size" help="Units in one pack."><input placeholder="10 capsules" value={f.packSize} onChange={(e) => setF({ ...f, packSize: e.target.value })} className={input} /></Field>
      <Field label="Sold / stocked as" help="The unit you count stock and sell in."><input placeholder="Strip" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className={input} /></Field>
      <Field label="Bought as" help="Bigger pack you buy from suppliers (optional)."><input placeholder="Box" value={f.purchaseUnit} onChange={(e) => setF({ ...f, purchaseUnit: e.target.value })} className={input} /></Field>
      {f.purchaseUnit && <Field label={`${f.unit || "Units"} in one ${f.purchaseUnit}`} help="Used to convert purchases into stock."><input type="number" min="1" placeholder="10" value={f.unitsPerPurchase} onChange={(e) => setF({ ...f, unitsPerPurchase: e.target.value })} className={input} /></Field>}
      <Field label="Reorder Level" help="Alert the pharmacist when available stock reaches this level."><input type="number" min="0" placeholder="50" value={f.reorderLevel} onChange={(e) => setF({ ...f, reorderLevel: e.target.value })} className={input} /></Field>
      <Field label="Maximum Stock" help="Most you want to keep. Leave empty for no limit."><input type="number" min="0" placeholder="500" value={f.maxStock} onChange={(e) => setF({ ...f, maxStock: e.target.value })} className={input} /></Field>
      <Field label="Location" help="Where it is kept in the pharmacy."><input placeholder="Rack A - Shelf 3" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className={input} /></Field>
    </div>
  );
}

const rowStatus = (m) => (!m.active ? ["Switched off", "bg-slate-200 text-slate-600"] : m.stock <= 0 ? ["Out of Stock", "bg-red-100 text-red-700"] : m.stock <= m.reorderLevel ? ["🟡 Low Stock", "bg-yellow-100 text-yellow-800"] : ["In Stock", "bg-emerald-100 text-emerald-700"]);

export function MedicinesTab({ canManage, onError }) {
  const [meds, setMeds] = useState(null);
  const [f, setF] = useState(BLANK);
  const [edit, setEdit] = useState(null); // { id, form }
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [scanFor, setScanFor] = useState(null);
  const [busy, setBusy] = useState(false);

  // A slow earlier search must not overwrite a newer one.
  const genRef = useRef(0);
  const load = () => {
    const gen = ++genRef.current;
    return apiGet(`/api/pharmacy/medicines${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((d) => {
      if (genRef.current === gen) setMeds(d.medicines);
    });
  };
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useRealtime({}, load);

  const explain = (err, fallback) =>
    err.message === "barcode_already_used" ? "That barcode is already used by another medicine."
    : err.message === "medicine_already_exists" ? "This medicine is already in your list."
    : `${fallback} (${err.message}).`;

  async function add(e) {
    e.preventDefault();
    setMsg("");
    setOk("");
    setBusy(true);
    try {
      const { medicine } = await apiSend("/api/pharmacy/medicines", "POST", toPayload(f, false));
      setOk(`Added ${medicine.name}.`);
      setF(BLANK);
      await load();
    } catch (err) {
      setMsg(explain(err, "Could not add"));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setMsg("");
    setBusy(true);
    try {
      await apiSend(`/api/pharmacy/medicines/${edit.id}`, "PATCH", toPayload(edit.form, true, edit.orig));
      setEdit(null);
      await load();
    } catch (err) {
      setMsg(explain(err, "Could not save"));
    } finally {
      setBusy(false);
    }
  }
  async function toggle(m) {
    try {
      await apiSend(`/api/pharmacy/medicines/${m.id}`, "PATCH", { active: !m.active });
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <button onClick={() => setShowForm((v) => !v)} className="flex w-full items-center justify-between text-left text-sm font-semibold">
            <span>Add Medicine</span><span className="text-slate-400">{showForm ? "−" : "+"}</span>
          </button>
          {ok && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{ok}</p>}
          {showForm && (
            <form onSubmit={add} className="mt-4 space-y-4">
              <MedicineForm f={f} setF={setF} onScan={() => setScanFor("add")} />
              <button disabled={busy} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{busy ? "Adding…" : "Add medicine"}</button>
            </form>
          )}
        </div>
      )}
      {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
      <input placeholder="Search by name, salt, brand, composition or barcode…" value={q} onChange={(e) => setQ(e.target.value)} className={`${input} max-w-md`} />
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Medicine</th><th className="px-3 py-2.5">Generic / Salt</th><th className="px-3 py-2.5">Manufacturer</th>
              <th className="px-3 py-2.5">Type · Strength</th><th className="px-3 py-2.5">Schedule</th><th className="px-3 py-2.5">Stock</th>
              <th className="px-3 py-2.5">Reorder Level</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {meds === null && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Loading medicines…</td></tr>}
            {meds?.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">No medicines yet — add your first one above.</td></tr>}
            {meds?.map((m) => {
              const [st, cls] = rowStatus(m);
              return (
                <tr key={m.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/60 ${m.active ? "" : "opacity-60"}`}>
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  <td className="px-3 py-2 text-slate-600">{m.genericName || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{m.manufacturer || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{m.medicineType}{m.strength ? ` · ${m.strength}` : ""}</td>
                  <td className="px-3 py-2">{m.schedule || "—"}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums">{m.stock}</td>
                  <td className="px-3 py-2 tabular-nums">{m.reorderLevel}</td>
                  <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{st}</span></td>
                  <td className="px-3 py-2 text-right">
                    {canManage && (
                      <>
                        <button onClick={() => setEdit({ id: m.id, name: m.name, form: toForm(m), orig: toForm(m) })} className="mr-1 rounded-md px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100">Edit</button>
                        <button onClick={() => toggle(m)} className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100">{m.active ? "Switch off" : "Switch on"}</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {scanFor && (
        <BarcodeScanner
          title="Scan the medicine's barcode"
          onClose={() => setScanFor(null)}
          onDetected={(code) => {
            if (scanFor === "add") setF((x) => ({ ...x, barcode: code }));
            else setEdit((x) => ({ ...x, form: { ...x.form, barcode: code } }));
            setScanFor(null);
          }}
        />
      )}
      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setEdit(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-base font-semibold">Edit {edit.name}</p>
            <MedicineForm f={edit.form} setF={(form) => setEdit((x) => ({ ...x, form }))} onScan={() => setScanFor("edit")} />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setEdit(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
              <button onClick={save} disabled={busy} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
