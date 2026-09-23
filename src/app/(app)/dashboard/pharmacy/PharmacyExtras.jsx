"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import { fmtDDMMYY } from "@/lib/dateFormat";
import { MEDICINE_TYPES, SCHEDULES } from "@/lib/medicineTypes";
import BarcodeScanner from "@/components/hms/BarcodeScanner";

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
const rupee = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const newKey = (id) => `${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Take payment for a pharmacy sale — its own route (PHARMACY-gated), not
// the tenant-wide Billing screen a solo pharmacy can't reach (it never
// rents the separate BILLING module). Whole amount or part, cash/card/UPI.
export function PharmacyPayBox({ billId, bill, onPaid }) {
  const [mode, setMode] = useState("CASH");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!bill) return null;
  if (bill.due <= 0) return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Paid {rupee(bill.total)}</span>;

  async function pay() {
    setBusy(true);
    setErr("");
    try {
      const r = await apiSend(`/api/pharmacy/sales/${billId}/pay`, "POST", { mode, ...(amount ? { amount: Number(amount) } : {}), idempotencyKey: newKey(billId) });
      setAmount("");
      onPaid?.(r.bill);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-medium text-amber-700">Due {rupee(bill.due)}</span>
      <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded border border-slate-300 px-1.5 py-1">
        <option value="CASH">Cash</option><option value="CARD">Card</option><option value="UPI">UPI</option>
      </select>
      <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`₹ ${bill.due}`} className="w-20 rounded border border-slate-300 px-1.5 py-1" />
      <button onClick={pay} disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Take payment</button>
      {err && <span className="text-red-600">{err}</span>}
    </div>
  );
}

// ── Medicine Master ──────────────────────────────────────────────────
export function MedicinesTab({ canManage, onError }) {
  const blank = {
    name: "", genericName: "", brandName: "", medicineType: "Tablet", strength: "", dosageForm: "",
    manufacturer: "", composition: "", category: "", schedule: "", prescriptionRequired: false, barcode: "",
    hsnCode: "", gstRate: "0", packSize: "", unit: "", reorderLevel: "10", maxStock: "", rack: "", shelf: "", bin: "",
  };
  const [meds, setMeds] = useState(null);
  const [f, setF] = useState(blank);
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [scanFor, setScanFor] = useState(null); // "add" | "edit" | null

  // Same stale-response race as Inventory's search — a quick keystroke's
  // slower earlier request can resolve after a later one and overwrite it.
  const searchGenRef = useRef(0);
  const load = () => {
    const gen = ++searchGenRef.current;
    return apiGet(`/api/pharmacy/medicines${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((d) => {
      if (searchGenRef.current === gen) setMeds(d.medicines);
    });
  };
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useRealtime({}, load);

  function payload(x) {
    return {
      name: x.name, genericName: x.genericName, brandName: x.brandName, medicineType: x.medicineType, strength: x.strength,
      dosageForm: x.dosageForm, manufacturer: x.manufacturer, composition: x.composition, category: x.category,
      schedule: x.schedule, prescriptionRequired: !!x.prescriptionRequired, barcode: x.barcode, hsnCode: x.hsnCode,
      gstRate: Number(x.gstRate || 0), packSize: x.packSize, unit: x.unit, reorderLevel: Number(x.reorderLevel || 10),
      ...(x.maxStock ? { maxStock: Number(x.maxStock) } : {}), rack: x.rack, shelf: x.shelf, bin: x.bin,
    };
  }

  async function add(e) {
    e.preventDefault();
    setMsg("");
    try {
      await apiSend("/api/pharmacy/medicines", "POST", payload(f));
      setF(blank);
      setShowForm(false);
      await load();
    } catch (err) {
      setMsg(err.message === "barcode_already_used" ? "That barcode is already used by another medicine." : `Could not add (${err.message}).`);
    }
  }
  async function save() {
    setMsg("");
    try {
      await apiSend(`/api/pharmacy/medicines/${edit.id}`, "PATCH", payload(edit));
      setEdit(null);
      await load();
    } catch (err) {
      setMsg(`Could not save (${err.message}).`);
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

  if (!meds) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <button onClick={() => setShowForm((v) => !v)} className="text-sm font-semibold">{showForm ? "▾" : "▸"} Add a medicine to the master list</button>
          {showForm && (
            <form onSubmit={add} className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <input required placeholder="Medicine Name (e.g. Paracetamol 500 mg)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${input} sm:col-span-2`} />
              <input placeholder="Generic / Salt Name" value={f.genericName} onChange={(e) => setF({ ...f, genericName: e.target.value })} className={input} />
              <input placeholder="Brand Name" value={f.brandName} onChange={(e) => setF({ ...f, brandName: e.target.value })} className={input} />
              <select value={f.medicineType} onChange={(e) => setF({ ...f, medicineType: e.target.value })} className={input}>{MEDICINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              <input placeholder="Strength (e.g. 500 mg)" value={f.strength} onChange={(e) => setF({ ...f, strength: e.target.value })} className={input} />
              <input placeholder="Dosage Form" value={f.dosageForm} onChange={(e) => setF({ ...f, dosageForm: e.target.value })} className={input} />
              <input placeholder="Manufacturer" value={f.manufacturer} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} className={input} />
              <input placeholder="Composition" value={f.composition} onChange={(e) => setF({ ...f, composition: e.target.value })} className={input} />
              <input placeholder="Category (e.g. Analgesic)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={input} />
              <select value={f.schedule} onChange={(e) => setF({ ...f, schedule: e.target.value })} className={input}>
                <option value="">Schedule</option>{SCHEDULES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={f.prescriptionRequired} onChange={(e) => setF({ ...f, prescriptionRequired: e.target.checked })} /> Prescription required</label>
              <div className="flex gap-1"><input placeholder="Barcode" value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value })} className={`${input} flex-1`} /><button type="button" onClick={() => setScanFor("add")} className="rounded-md border border-slate-300 px-2 text-xs">Scan</button></div>
              <input placeholder="HSN Code" value={f.hsnCode} onChange={(e) => setF({ ...f, hsnCode: e.target.value })} className={input} />
              <select value={f.gstRate} onChange={(e) => setF({ ...f, gstRate: e.target.value })} className={input}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>GST {g}%</option>)}</select>
              <input placeholder="Pack Size (e.g. 10 tablets)" value={f.packSize} onChange={(e) => setF({ ...f, packSize: e.target.value })} className={input} />
              <input placeholder="Unit (Tablet / Bottle / Strip…)" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} className={input} />
              <label className="text-xs"><span className="block text-slate-500">Reorder Level</span><input type="number" min="0" value={f.reorderLevel} onChange={(e) => setF({ ...f, reorderLevel: e.target.value })} className={`${input} w-full`} /></label>
              <label className="text-xs"><span className="block text-slate-500">Maximum Stock</span><input type="number" min="0" value={f.maxStock} onChange={(e) => setF({ ...f, maxStock: e.target.value })} className={`${input} w-full`} /></label>
              <input placeholder="Rack" value={f.rack} onChange={(e) => setF({ ...f, rack: e.target.value })} className={input} />
              <input placeholder="Shelf" value={f.shelf} onChange={(e) => setF({ ...f, shelf: e.target.value })} className={input} />
              <input placeholder="Bin" value={f.bin} onChange={(e) => setF({ ...f, bin: e.target.value })} className={input} />
              <button className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">Add medicine</button>
            </form>
          )}
        </div>
      )}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <input placeholder="Search medicines…" value={q} onChange={(e) => setQ(e.target.value)} className={`${input} w-full max-w-sm`} />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Medicine</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Schedule</th><th className="px-3 py-2">GST</th><th className="px-3 py-2">Reorder</th><th className="px-3 py-2">Location</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {meds.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-slate-400">No medicines yet.</td></tr>}
            {meds.map((m) => (
              <tr key={m.id} className={`border-b border-slate-100 last:border-0 ${m.active ? "" : "opacity-50"}`}>
                <td className="px-3 py-2 font-medium">{m.name}{m.strength ? <span className="text-slate-400"> · {m.strength}</span> : ""}<p className="text-xs font-normal text-slate-400">{m.genericName}{m.brandName ? ` · ${m.brandName}` : ""}</p></td>
                <td className="px-3 py-2">{m.medicineType}</td>
                <td className="px-3 py-2">{m.category || "—"}</td>
                <td className="px-3 py-2">{m.schedule || "—"}</td>
                <td className="px-3 py-2">{m.gstRate}%</td>
                <td className="px-3 py-2">{m.reorderLevel}</td>
                <td className="px-3 py-2 text-xs">{[m.rack, m.shelf, m.bin].filter(Boolean).join("-") || "—"}</td>
                <td className="px-3 py-2 text-right">
                  {canManage && (
                    <>
                      <button onClick={() => setEdit(m)} className="mr-2 text-xs underline">Edit</button>
                      <button onClick={() => toggle(m)} className="text-xs text-slate-500">{m.active ? "Switch off" : "Switch on"}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {scanFor && (
        <BarcodeScanner
          title="Scan the medicine's barcode"
          onClose={() => setScanFor(null)}
          onDetected={(code) => {
            if (scanFor === "add") setF((x) => ({ ...x, barcode: code }));
            else setEdit((x) => ({ ...x, barcode: code }));
            setScanFor(null);
          }}
        />
      )}
      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setEdit(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-semibold">Edit {edit.name}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={input} placeholder="Name" />
              <input value={edit.genericName || ""} onChange={(e) => setEdit({ ...edit, genericName: e.target.value })} className={input} placeholder="Generic" />
              <input value={edit.brandName || ""} onChange={(e) => setEdit({ ...edit, brandName: e.target.value })} className={input} placeholder="Brand" />
              <select value={edit.medicineType} onChange={(e) => setEdit({ ...edit, medicineType: e.target.value })} className={input}>{MEDICINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              <input value={edit.strength || ""} onChange={(e) => setEdit({ ...edit, strength: e.target.value })} className={input} placeholder="Strength" />
              <input value={edit.category || ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} className={input} placeholder="Category" />
              <div className="flex gap-1"><input value={edit.barcode || ""} onChange={(e) => setEdit({ ...edit, barcode: e.target.value })} className={`${input} flex-1`} placeholder="Barcode" /><button type="button" onClick={() => setScanFor("edit")} className="rounded-md border border-slate-300 px-2 text-xs">Scan</button></div>
              <input value={edit.hsnCode || ""} onChange={(e) => setEdit({ ...edit, hsnCode: e.target.value })} className={input} placeholder="HSN" />
              <select value={String(edit.gstRate)} onChange={(e) => setEdit({ ...edit, gstRate: e.target.value })} className={input}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>GST {g}%</option>)}</select>
              <input type="number" value={edit.reorderLevel} onChange={(e) => setEdit({ ...edit, reorderLevel: e.target.value })} className={input} placeholder="Reorder level" />
              <input type="number" value={edit.maxStock || ""} onChange={(e) => setEdit({ ...edit, maxStock: e.target.value })} className={input} placeholder="Max stock" />
              <input value={edit.rack || ""} onChange={(e) => setEdit({ ...edit, rack: e.target.value })} className={input} placeholder="Rack" />
              <input value={edit.shelf || ""} onChange={(e) => setEdit({ ...edit, shelf: e.target.value })} className={input} placeholder="Shelf" />
              <input value={edit.bin || ""} onChange={(e) => setEdit({ ...edit, bin: e.target.value })} className={input} placeholder="Bin" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEdit(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Cancel</button>
              <button onClick={save} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Suppliers ────────────────────────────────────────────────────────
export function SuppliersTab({ canManage, onError }) {
  const blank = { name: "", companyName: "", contactPerson: "", phone: "", email: "", address: "", gstin: "", drugLicenceNo: "", paymentTerms: "", creditDays: "" };
  const [rows, setRows] = useState(null);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState("");

  const load = () => apiGet("/api/pharmacy/suppliers").then((d) => setRows(d.suppliers));
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function add(e) {
    e.preventDefault();
    setMsg("");
    try {
      await apiSend("/api/pharmacy/suppliers", "POST", { ...f, ...(f.creditDays ? { creditDays: Number(f.creditDays) } : {}) });
      setF(blank);
      await load();
    } catch (err) {
      setMsg(`Could not add (${err.message}).`);
    }
  }
  async function toggle(s) {
    try {
      await apiSend(`/api/pharmacy/suppliers/${s.id}`, "PATCH", { active: !s.active });
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  if (!rows) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;
  return (
    <div className="space-y-4">
      {canManage && (
        <form onSubmit={add} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <p className="col-span-full text-sm font-semibold">Add a supplier</p>
          <input required placeholder="Supplier name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
          <input placeholder="Company name" value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} className={input} />
          <input placeholder="Contact person" value={f.contactPerson} onChange={(e) => setF({ ...f, contactPerson: e.target.value })} className={input} />
          <input placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={input} />
          <input placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={input} />
          <input placeholder="GSTIN" value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} className={input} />
          <input placeholder="Drug Licence No." value={f.drugLicenceNo} onChange={(e) => setF({ ...f, drugLicenceNo: e.target.value })} className={input} />
          <input placeholder="Payment terms" value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value })} className={input} />
          <input type="number" min="0" placeholder="Credit days" value={f.creditDays} onChange={(e) => setF({ ...f, creditDays: e.target.value })} className={input} />
          <input placeholder="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className={`${input} sm:col-span-3`} />
          <button className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] sm:col-span-3">Add supplier</button>
        </form>
      )}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Supplier</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">GSTIN</th><th className="px-3 py-2">Drug Licence</th><th className="px-3 py-2">Terms</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-slate-400">No suppliers yet.</td></tr>}
            {rows.map((s) => (
              <tr key={s.id} className={`border-b border-slate-100 last:border-0 ${s.active ? "" : "opacity-50"}`}>
                <td className="px-3 py-2 font-medium">{s.name}<p className="text-xs font-normal text-slate-400">{s.companyName}</p></td>
                <td className="px-3 py-2 text-xs">{s.contactPerson}{s.phone ? ` · ${s.phone}` : ""}</td>
                <td className="px-3 py-2 text-xs">{s.gstin || "—"}</td>
                <td className="px-3 py-2 text-xs">{s.drugLicenceNo || "—"}</td>
                <td className="px-3 py-2 text-xs">{s.paymentTerms || "—"}{s.creditDays ? ` · ${s.creditDays}d credit` : ""}</td>
                <td className="px-3 py-2 text-right">{canManage && <button onClick={() => toggle(s)} className="text-xs text-slate-500 underline">{s.active ? "Switch off" : "Switch on"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── GRN (goods receipt) ─────────────────────────────────────────────
export function GrnTab({ onError, receiveFor, onConsumedReceiveFor }) {
  const emptyLine = { medicineId: "", batchNumber: "", manufacturingDate: "", expiryDate: "", receivedQuantity: "", freeQuantity: "0", damagedQuantity: "0", rejectedQuantity: "0", purchaseRate: "", mrp: "", gstRate: "0" };
  const [meds, setMeds] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [openPOs, setOpenPOs] = useState([]);
  const [grns, setGrns] = useState(null);
  const [head, setHead] = useState({ supplierId: "", poId: "", supplierInvoiceNumber: "", supplierInvoiceDate: "", grnDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const load = () => apiGet("/api/pharmacy/grn").then((d) => setGrns(d.grns));
  useEffect(() => {
    apiGet("/api/pharmacy/medicines?active=true").then((d) => setMeds(d.medicines)).catch(() => {});
    apiGet("/api/pharmacy/suppliers").then((d) => setSuppliers(d.suppliers)).catch(() => {});
    apiGet("/api/pharmacy/purchase-orders").then((d) => setOpenPOs(d.purchaseOrders.filter((p) => ["SENT", "PARTIALLY_RECEIVED"].includes(p.status)))).catch(() => {});
    load().catch((e) => setMsg(e.message));
  }, []);

  // Arriving from "Receive (GRN)" on a Purchase Order: pre-fill supplier +
  // one line per still-outstanding PO item (batch/expiry left blank — that
  // only exists once the physical stock is in hand).
  useEffect(() => {
    if (!receiveFor) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHead((h) => ({ ...h, poId: String(receiveFor.id), supplierId: receiveFor.supplierId ? String(receiveFor.supplierId) : h.supplierId }));
    const outstanding = receiveFor.items.filter((i) => i.receivedQuantity < i.quantity);
    if (outstanding.length) {
      setLines(outstanding.map((i) => ({ ...emptyLine, medicineId: String(i.medicineId), receivedQuantity: String(i.quantity - i.receivedQuantity), purchaseRate: String(i.purchaseRate), gstRate: String(i.gstRate) })));
    }
    onConsumedReceiveFor?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiveFor]);

  const setLine = (i, patch) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const items = lines
        .filter((l) => l.medicineId && l.batchNumber && l.receivedQuantity)
        .map((l) => ({
          medicineId: Number(l.medicineId), batchNumber: l.batchNumber, manufacturingDate: l.manufacturingDate, expiryDate: l.expiryDate,
          receivedQuantity: Number(l.receivedQuantity), freeQuantity: Number(l.freeQuantity || 0), damagedQuantity: Number(l.damagedQuantity || 0),
          rejectedQuantity: Number(l.rejectedQuantity || 0), purchaseRate: Number(l.purchaseRate || 0), mrp: Number(l.mrp || 0), gstRate: Number(l.gstRate || 0),
        }));
      if (!items.length) throw new Error("no_items");
      const r = await apiSend("/api/pharmacy/grn", "POST", {
        ...head, ...(head.supplierId ? { supplierId: Number(head.supplierId) } : {}), ...(head.poId ? { poId: Number(head.poId) } : {}), items,
      });
      setDone(r);
      setLines([{ ...emptyLine }]);
      await load();
    } catch (err) {
      onError(err.message === "no_items" ? "Add at least one complete line (medicine, batch, received qty)." : `Could not save (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  if (!grns) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold">Receive stock (GRN)</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <select value={head.poId} onChange={(e) => setHead({ ...head, poId: e.target.value })} className={input}>
            <option value="">— against a purchase order (optional) —</option>
            {openPOs.map((p) => <option key={p.id} value={p.id}>{p.poNumber} · {p.supplierName || "no supplier"}</option>)}
          </select>
          <select value={head.supplierId} onChange={(e) => setHead({ ...head, supplierId: e.target.value })} className={input}>
            <option value="">— supplier (optional) —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input placeholder="Supplier invoice number" value={head.supplierInvoiceNumber} onChange={(e) => setHead({ ...head, supplierInvoiceNumber: e.target.value })} className={input} />
          <label className="text-xs"><span className="block text-slate-500">Invoice date</span><input type="date" value={head.supplierInvoiceDate} onChange={(e) => setHead({ ...head, supplierInvoiceDate: e.target.value })} className={`${input} w-full`} /></label>
          <label className="text-xs"><span className="block text-slate-500">GRN date</span><input required type="date" value={head.grnDate} onChange={(e) => setHead({ ...head, grnDate: e.target.value })} className={`${input} w-full`} /></label>
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-1.5 rounded-md border border-slate-100 bg-slate-50 p-2 sm:grid-cols-6 lg:grid-cols-11">
              <select value={l.medicineId} onChange={(e) => setLine(i, { medicineId: e.target.value })} className="col-span-2 rounded border border-slate-300 px-1.5 py-1 text-xs lg:col-span-2">
                <option value="">medicine</option>
                {meds.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input placeholder="batch" value={l.batchNumber} onChange={(e) => setLine(i, { batchNumber: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
              <input type="date" title="Mfg date" value={l.manufacturingDate} onChange={(e) => setLine(i, { manufacturingDate: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
              <input type="date" title="Expiry date" value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
              <input type="number" min="0" placeholder="recd qty" value={l.receivedQuantity} onChange={(e) => setLine(i, { receivedQuantity: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
              <input type="number" min="0" placeholder="free" value={l.freeQuantity} onChange={(e) => setLine(i, { freeQuantity: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
              <input type="number" min="0" placeholder="damaged" value={l.damagedQuantity} onChange={(e) => setLine(i, { damagedQuantity: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
              <input type="number" min="0" step="0.01" placeholder="purch. rate" value={l.purchaseRate} onChange={(e) => setLine(i, { purchaseRate: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
              <input type="number" min="0" step="0.01" placeholder="MRP" value={l.mrp} onChange={(e) => setLine(i, { mrp: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
              <select value={l.gstRate} onChange={(e) => setLine(i, { gstRate: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs">{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</select>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setLines((xs) => [...xs, { ...emptyLine }])} className="rounded-md border border-slate-300 px-2 py-1 text-xs">+ line</button>
            {lines.length > 1 && <button type="button" onClick={() => setLines((xs) => xs.slice(0, -1))} className="rounded-md border border-slate-300 px-2 py-1 text-xs">− remove last</button>}
          </div>
        </div>
        <textarea placeholder="Notes (optional)" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} className={`${input} w-full`} rows={2} />
        <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Save GRN — add accepted stock</button>
        {done && <p className="text-sm text-emerald-700">Saved as {done.grnNumber}. Only the accepted quantity (received + free − damaged − rejected) was added to stock.</p>}
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">GRN #</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Supplier</th><th className="px-3 py-2">Invoice #</th><th className="px-3 py-2">Lines</th><th className="px-3 py-2">Accepted units</th></tr>
          </thead>
          <tbody>
            {grns.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-slate-400">No GRNs yet.</td></tr>}
            {grns.map((g) => (
              <tr key={g.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium">{g.grnNumber}</td>
                <td className="px-3 py-2">{fmtDDMMYY(g.grnDate)}</td>
                <td className="px-3 py-2">{g.supplierName || "—"}</td>
                <td className="px-3 py-2">{g.supplierInvoiceNumber || "—"}</td>
                <td className="px-3 py-2">{g.itemCount}</td>
                <td className="px-3 py-2">{g.totalAccepted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stock transfer between pharmacy instances ───────────────────────
export function TransferTab({ onError }) {
  const [rows, setRows] = useState([]);
  const [instances, setInstances] = useState([]);
  const [f, setF] = useState({ stockId: "", toInstanceId: "", quantity: "", reason: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet("/api/pharmacy/inventory").then((d) => setRows(d.rows.filter((r) => r.quantity > 0))).catch((e) => setMsg(e.message));
    apiGet("/api/pharmacy/instances").then((d) => setInstances((d.instances || []).filter((i) => i.status === "ACTIVE"))).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/pharmacy/stock/transfer", "POST", { stockId: Number(f.stockId), toInstanceId: Number(f.toInstanceId), quantity: Number(f.quantity), reason: f.reason });
      setMsg("Transferred.");
      setF({ stockId: "", toInstanceId: "", quantity: "", reason: "" });
    } catch (err) {
      onError(err.message === "same_instance" ? "Source and destination are the same pharmacy." : err.message === "insufficient_stock" ? "Not enough stock in that batch." : `Could not transfer (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  if (instances.length < 2) {
    return <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Only one pharmacy instance exists — transfers need at least two (see Module Instances in Admin).</p>;
  }
  return (
    <form onSubmit={submit} className="max-w-xl space-y-2 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold">Transfer stock between pharmacies</p>
      <select required value={f.stockId} onChange={(e) => setF({ ...f, stockId: e.target.value })} className={`${input} w-full`}>
        <option value="">— pick a batch —</option>
        {rows.map((r) => <option key={r.stockId} value={r.stockId}>{r.medicineName} · batch {r.batchNumber || "—"} · {r.quantity} in stock</option>)}
      </select>
      <select required value={f.toInstanceId} onChange={(e) => setF({ ...f, toInstanceId: e.target.value })} className={`${input} w-full`}>
        <option value="">— to which pharmacy —</option>
        {instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <input required type="number" min="1" placeholder="Quantity" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} className={`${input} w-full`} />
      <input placeholder="Reason (optional)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={`${input} w-full`} />
      <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Transfer</button>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
    </form>
  );
}

// ── Customer & supplier returns ─────────────────────────────────────
export function ReturnsTab({ onError }) {
  const [tab, setTab] = useState("customer");
  const [billId, setBillId] = useState("");
  const [bill, setBill] = useState(null);
  const [custForm, setCustForm] = useState({ billItemId: "", quantity: "", reason: "" });
  const [rows, setRows] = useState([]);
  const [supForm, setSupForm] = useState({ stockId: "", quantity: "", reason: "EXPIRED", notes: "" });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiGet("/api/pharmacy/inventory").then((d) => setRows(d.rows.filter((r) => r.quantity > 0))).catch(() => {});
  }, []);

  async function lookupBill(e) {
    e.preventDefault();
    setMsg("");
    setBill(null);
    try {
      const d = await apiGet(`/api/pharmacy/sales/${billId}`);
      setBill(d.bill);
    } catch (err) {
      setMsg(`Could not find that bill (${err.message}).`);
    }
  }
  async function submitCustomerReturn(e) {
    e.preventDefault();
    setMsg("");
    try {
      await apiSend("/api/pharmacy/returns/customer", "POST", { billItemId: Number(custForm.billItemId), quantity: Number(custForm.quantity), reason: custForm.reason });
      setMsg("Return recorded — stock and refund updated.");
      setCustForm({ billItemId: "", quantity: "", reason: "" });
      setBill(null);
      setBillId("");
    } catch (err) {
      onError(err.message === "return_quantity_exceeds_sold" ? "That's more than was sold on this line." : `Could not record return (${err.message}).`);
    }
  }
  async function submitSupplierReturn(e) {
    e.preventDefault();
    setMsg("");
    try {
      await apiSend("/api/pharmacy/returns/supplier", "POST", { stockId: Number(supForm.stockId), quantity: Number(supForm.quantity), reason: supForm.reason, notes: supForm.notes });
      setMsg("Supplier return recorded — stock reduced.");
      setSupForm({ stockId: "", quantity: "", reason: "EXPIRED", notes: "" });
    } catch (err) {
      onError(err.message === "insufficient_stock" ? "Not enough stock in that batch." : `Could not record return (${err.message}).`);
    }
  }

  const pharmacyItems = (bill?.bill_items || []).filter((i) => i.stock_id);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 text-sm">
        {[["customer", "Customer return"], ["supplier", "Supplier return"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-slate-100 text-slate-600"}`}>{l}</button>
        ))}
      </div>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      {tab === "customer" ? (
        <div className="max-w-xl space-y-3">
          <form onSubmit={lookupBill} className="flex gap-2 rounded-lg border border-slate-200 bg-white p-4">
            <input required placeholder="Bill / invoice #" value={billId} onChange={(e) => setBillId(e.target.value)} className={`${input} flex-1`} />
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Find bill</button>
          </form>
          {bill && (
            <form onSubmit={submitCustomerReturn} className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold">{bill.patient_name} — Bill #{bill.id}</p>
              {pharmacyItems.length === 0 ? (
                <p className="text-sm text-slate-400">No pharmacy items sold on this bill.</p>
              ) : (
                <>
                  <select required value={custForm.billItemId} onChange={(e) => setCustForm({ ...custForm, billItemId: e.target.value })} className={`${input} w-full`}>
                    <option value="">— pick the sold item —</option>
                    {pharmacyItems.map((it) => <option key={it.id} value={it.id}>{it.description} · qty {it.quantity} · ₹{it.amount}</option>)}
                  </select>
                  <input required type="number" min="1" placeholder="Return quantity" value={custForm.quantity} onChange={(e) => setCustForm({ ...custForm, quantity: e.target.value })} className={`${input} w-full`} />
                  <input required placeholder="Reason" value={custForm.reason} onChange={(e) => setCustForm({ ...custForm, reason: e.target.value })} className={`${input} w-full`} />
                  <button className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">Return &amp; refund</button>
                </>
              )}
            </form>
          )}
        </div>
      ) : (
        <form onSubmit={submitSupplierReturn} className="max-w-xl space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <select required value={supForm.stockId} onChange={(e) => setSupForm({ ...supForm, stockId: e.target.value })} className={`${input} w-full`}>
            <option value="">— pick a batch —</option>
            {rows.map((r) => <option key={r.stockId} value={r.stockId}>{r.medicineName} · batch {r.batchNumber || "—"} · {r.quantity} in stock</option>)}
          </select>
          <input required type="number" min="1" placeholder="Quantity" value={supForm.quantity} onChange={(e) => setSupForm({ ...supForm, quantity: e.target.value })} className={`${input} w-full`} />
          <select value={supForm.reason} onChange={(e) => setSupForm({ ...supForm, reason: e.target.value })} className={`${input} w-full`}>
            {["EXPIRED", "DAMAGED", "WRONG_MEDICINE", "WRONG_BATCH", "OTHER"].map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
          <input placeholder="Notes (optional)" value={supForm.notes} onChange={(e) => setSupForm({ ...supForm, notes: e.target.value })} className={`${input} w-full`} />
          <button className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">Send back to supplier</button>
        </form>
      )}
    </div>
  );
}

// ── Sell (walk-in / OTC, no prescription) ───────────────────────────
export function SellTab({ onError }) {
  const [meds, setMeds] = useState(null);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]); // [{medicineId, name, quantity}]
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [payBill, setPayBill] = useState(null);
  const [msg, setMsg] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    apiGet("/api/pharmacy/medicines?active=true").then((d) => setMeds(d.medicines)).catch((e) => setMsg(e.message));
  }, []);

  const shown = (meds || []).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()) || (m.barcode || "").toLowerCase() === q.toLowerCase());

  function addToCart(m) {
    setCart((c) => (c.some((x) => x.medicineId === m.id) ? c.map((x) => (x.medicineId === m.id ? { ...x, quantity: x.quantity + 1 } : x)) : [...c, { medicineId: m.id, name: m.name, quantity: 1 }]));
  }
  function setQty(id, qty) {
    setCart((c) => c.map((x) => (x.medicineId === id ? { ...x, quantity: Math.max(1, qty) } : x)));
  }
  function removeItem(id) {
    setCart((c) => c.filter((x) => x.medicineId !== id));
  }

  async function submit() {
    if (!customer.name.trim() || cart.length === 0) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await apiSend("/api/pharmacy/walk-in-sale", "POST", {
        customerName: customer.name, phone: customer.phone,
        items: cart.map((c) => ({ medicineId: c.medicineId, quantity: c.quantity })),
      });
      setDone(r);
      setCart([]);
      setCustomer({ name: "", phone: "" });
    } catch (err) {
      const m = err.message.startsWith("insufficient_stock:") ? `Not enough stock: ${err.message.split(":")[1]}.`
        : err.message.startsWith("no_price_set:") ? `No selling price set yet for ${err.message.split(":")[1]} — set it in Inventory.`
        : `Could not complete the sale (${err.message}).`;
      setMsg(m);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-md space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
        <p className="font-semibold text-emerald-800">Sale complete — {rupee(done.total)}</p>
        <PharmacyPayBox billId={done.billId} bill={payBill || { id: done.billId, total: done.total, due: done.total }} onPaid={setPayBill} />
        <div className="flex flex-wrap gap-2">
          <a href={`/print/receipt/${done.billId}`} target="_blank" rel="noreferrer" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">Print bill</a>
          <button onClick={() => { setDone(null); setPayBill(null); }} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs text-[var(--hms-btn-fg)]">New sale</button>
        </div>
      </div>
    );
  }
  if (!meds) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold">Who is it for?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input required placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className={input} />
          <input placeholder="Phone (optional)" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className={input} />
        </div>
        <p className="pt-2 text-sm font-semibold">Medicines</p>
        <div className="flex gap-1">
          <input placeholder="Search or type a barcode" value={q} onChange={(e) => setQ(e.target.value)} className={`${input} flex-1`} />
          <button type="button" onClick={() => setScanning(true)} className="rounded-md border border-slate-300 px-3 text-xs">📷 Scan</button>
        </div>
        {scanning && (
          <BarcodeScanner
            title="Scan a medicine's barcode"
            onClose={() => setScanning(false)}
            onDetected={(code) => {
              setScanning(false);
              const hit = (meds || []).find((m) => m.barcode && m.barcode === code);
              if (hit) addToCart(hit);
              else setMsg(`No medicine found with barcode ${code}.`);
            }}
          />
        )}
        <div className="grid max-h-72 gap-1 overflow-auto sm:grid-cols-2">
          {shown.map((m) => (
            <button key={m.id} type="button" onClick={() => addToCart(m)} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-left text-sm hover:border-slate-400">
              <span>{m.name}{m.strength ? <span className="text-xs text-slate-400"> · {m.strength}</span> : ""}</span>
              <span className="text-xs text-slate-400">{m.medicineType}</span>
            </button>
          ))}
          {shown.length === 0 && <p className="text-xs text-slate-400">No medicines match.</p>}
        </div>
      </div>
      <aside className="h-fit space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <p className="font-semibold">Cart</p>
        {cart.length === 0 && <p className="text-xs text-slate-400">No items yet.</p>}
        {cart.map((c) => (
          <div key={c.medicineId} className="flex items-center justify-between gap-1.5 text-xs">
            <span className="flex-1 truncate">{c.name}</span>
            <input type="number" min="1" value={c.quantity} onChange={(e) => setQty(c.medicineId, Number(e.target.value))} className="w-14 rounded border border-slate-300 px-1 py-0.5" />
            <button onClick={() => removeItem(c.medicineId)} className="text-red-500">✕</button>
          </div>
        ))}
        <button onClick={submit} disabled={busy || !customer.name.trim() || cart.length === 0} className="w-full rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Complete sale</button>
        <p className="text-[11px] text-slate-400">Price + GST are taken from stock&rsquo;s selling rate / MRP and the medicine&rsquo;s GST rate.</p>
        {msg && <p className="text-xs text-red-600">{msg}</p>}
      </aside>
    </div>
  );
}
