"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

const input = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
const lab = "block text-xs font-medium text-slate-600";
const help = "mt-0.5 block text-[11px] font-normal leading-tight text-slate-400";
const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
const primary = "rounded-lg bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50";
const th = "border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500";

// ── Suppliers ────────────────────────────────────────────────────────
export function SuppliersTab({ canManage, onError }) {
  const blank = { name: "", companyName: "", contactPerson: "", phone: "", email: "", address: "", gstin: "", drugLicenceNo: "", paymentTerms: "", creditDays: "" };
  const [rows, setRows] = useState(null);
  const [f, setF] = useState(blank);
  const [ok, setOk] = useState("");
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);

  const load = () => apiGet("/api/pharmacy/suppliers").then((d) => setRows(d.suppliers));
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function add(e) {
    e.preventDefault();
    setMsg("");
    setOk("");
    try {
      await apiSend("/api/pharmacy/suppliers", "POST", { ...f, ...(f.creditDays ? { creditDays: Number(f.creditDays) } : {}) });
      setOk(`Added ${f.name}.`);
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
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className={card}>
          <button onClick={() => setShow((v) => !v)} className="flex w-full items-center justify-between text-left text-sm font-semibold">
            <span>Add Supplier</span><span className="text-slate-400">{show ? "−" : "+"}</span>
          </button>
          {ok && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{ok}</p>}
          {show && (
            <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className={lab}>Supplier Name<input required placeholder="Sharma Medical Agency" value={f.name} onChange={set("name")} className={`${input} mt-1`} /><span className={help}>How you know them.</span></label>
              <label className={lab}>Company Name<input placeholder="Sharma Pharma Pvt Ltd" value={f.companyName} onChange={set("companyName")} className={`${input} mt-1`} /></label>
              <label className={lab}>Contact Person<input placeholder="Rakesh Sharma" value={f.contactPerson} onChange={set("contactPerson")} className={`${input} mt-1`} /></label>
              <label className={lab}>Phone<input placeholder="98xxxxxxxx" value={f.phone} onChange={set("phone")} className={`${input} mt-1`} /></label>
              <label className={lab}>Email<input type="email" placeholder="orders@supplier.com" value={f.email} onChange={set("email")} className={`${input} mt-1`} /></label>
              <label className={lab}>GSTIN<input placeholder="22AAAAA0000A1Z5" value={f.gstin} onChange={set("gstin")} className={`${input} mt-1`} /><span className={help}>Their GST number (optional).</span></label>
              <label className={lab}>Drug Licence No.<input placeholder="DL-12345" value={f.drugLicenceNo} onChange={set("drugLicenceNo")} className={`${input} mt-1`} /></label>
              <label className={lab}>Payment Terms<input placeholder="Pay within 30 days" value={f.paymentTerms} onChange={set("paymentTerms")} className={`${input} mt-1`} /></label>
              <label className={lab}>Credit Days<input type="number" min="0" placeholder="30" value={f.creditDays} onChange={set("creditDays")} className={`${input} mt-1`} /><span className={help}>Days you get to pay after receiving goods.</span></label>
              <label className={`${lab} sm:col-span-2 lg:col-span-3`}>Address<input placeholder="Shop no., street, city" value={f.address} onChange={set("address")} className={`${input} mt-1`} /></label>
              <div className="sm:col-span-2 lg:col-span-3"><button className={primary}>Add supplier</button></div>
            </form>
          )}
        </div>
      )}
      {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className={th}><tr><th className="px-3 py-2.5">Supplier</th><th className="px-3 py-2.5">Contact</th><th className="px-3 py-2.5">GSTIN</th><th className="px-3 py-2.5">Drug Licence</th><th className="px-3 py-2.5">Terms</th><th className="px-3 py-2.5" /></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No suppliers yet.</td></tr>}
            {rows?.map((s) => (
              <tr key={s.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/60 ${s.active ? "" : "opacity-50"}`}>
                <td className="px-3 py-2 font-medium">{s.name}<p className="text-xs font-normal text-slate-400">{s.companyName}</p></td>
                <td className="px-3 py-2 text-xs">{s.contactPerson}{s.phone ? ` · ${s.phone}` : ""}</td>
                <td className="px-3 py-2 text-xs">{s.gstin || "—"}</td>
                <td className="px-3 py-2 text-xs">{s.drugLicenceNo || "—"}</td>
                <td className="px-3 py-2 text-xs">{s.paymentTerms || "—"}{s.creditDays ? ` · ${s.creditDays}d credit` : ""}</td>
                <td className="px-3 py-2 text-right">{canManage && <button onClick={() => toggle(s)} className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100">{s.active ? "Switch off" : "Switch on"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stock transfer between pharmacy locations ───────────────────────
export function TransferTab({ onError }) {
  const [rows, setRows] = useState([]);
  const [instances, setInstances] = useState(null);
  const [f, setF] = useState({ stockId: "", toInstanceId: "", quantity: "", reason: "" });
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet("/api/pharmacy/inventory").then((d) => setRows(d.rows.filter((r) => r.quantity > 0))).catch((e) => onError(e.message));
    apiGet("/api/pharmacy/instances").then((d) => setInstances((d.instances || []).filter((i) => i.status === "ACTIVE"))).catch(() => setInstances([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setOk("");
    onError("");
    try {
      await apiSend("/api/pharmacy/stock/transfer", "POST", { stockId: Number(f.stockId), toInstanceId: Number(f.toInstanceId), quantity: Number(f.quantity), reason: f.reason });
      setOk("Stock moved. Both pharmacies' counts are updated and the move is recorded.");
      setF({ stockId: "", toInstanceId: "", quantity: "", reason: "" });
      apiGet("/api/pharmacy/inventory").then((d) => setRows(d.rows.filter((r) => r.quantity > 0))).catch(() => {});
    } catch (err) {
      onError(err.message === "same_instance" ? "Source and destination are the same pharmacy." : err.message === "insufficient_stock" ? "Not enough stock in that batch." : `Could not move stock (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  if (instances === null) return <p className="text-sm text-slate-400">Loading…</p>;
  if (instances.length < 2) {
    return <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">You have one pharmacy location. To move stock between locations, add another pharmacy location first (Admin → Module instances).</p>;
  }
  const pick = rows.find((r) => String(r.stockId) === f.stockId);
  return (
    <form onSubmit={submit} className={`${card} max-w-xl space-y-3`}>
      <div><p className="text-sm font-semibold">Move stock to another pharmacy</p><p className="text-xs text-slate-400">The batch keeps its expiry and prices at the destination.</p></div>
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{ok}</p>}
      <label className={lab}>Medicine batch
        <select required value={f.stockId} onChange={(e) => setF({ ...f, stockId: e.target.value })} className={`${input} mt-1`}>
          <option value="">— choose a batch —</option>
          {rows.map((r) => <option key={r.stockId} value={r.stockId}>{r.medicineName} · batch {r.batchNumber || "—"} · {r.quantity} in stock</option>)}
        </select>
      </label>
      <label className={lab}>Move to
        <select required value={f.toInstanceId} onChange={(e) => setF({ ...f, toInstanceId: e.target.value })} className={`${input} mt-1`}>
          <option value="">— which pharmacy —</option>
          {instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </label>
      <label className={lab}>Quantity
        <input required type="number" min="1" max={pick?.quantity} placeholder="10" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} className={`${input} mt-1`} />
        <span className={help}>{pick ? `Up to ${pick.quantity} available in this batch.` : "How many units to move."}</span>
      </label>
      <label className={lab}>Reason<input placeholder="Emergency ward needs stock" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={`${input} mt-1`} /><span className={help}>Optional — shown in the stock movement record.</span></label>
      <button disabled={busy} className={primary}>{busy ? "Moving…" : "Move stock"}</button>
    </form>
  );
}

// ── Customer & supplier returns ─────────────────────────────────────
export function ReturnsTab({ onError, mode = "customer" }) {
  const [billId, setBillId] = useState("");
  const [bill, setBill] = useState(null);
  const [custForm, setCustForm] = useState({ billItemId: "", quantity: "", reason: "" });
  const [rows, setRows] = useState([]);
  const [supForm, setSupForm] = useState({ stockId: "", quantity: "", reason: "EXPIRED", notes: "" });
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (mode === "supplier") apiGet("/api/pharmacy/inventory").then((d) => setRows(d.rows.filter((r) => r.quantity > 0))).catch(() => {});
  }, [mode]);

  async function lookupBill(e) {
    e.preventDefault();
    setOk("");
    onError("");
    setBill(null);
    try {
      const d = await apiGet(`/api/pharmacy/sales/${billId}`);
      setBill(d.bill);
    } catch (err) {
      onError(`Could not find that bill (${err.message}).`);
    }
  }
  async function submitCustomerReturn(e) {
    e.preventDefault();
    setOk("");
    onError("");
    try {
      await apiSend("/api/pharmacy/returns/customer", "POST", { billItemId: Number(custForm.billItemId), quantity: Number(custForm.quantity), reason: custForm.reason });
      setOk("Return recorded — the units are back in stock and the refund is on the bill.");
      setCustForm({ billItemId: "", quantity: "", reason: "" });
      setBill(null);
      setBillId("");
    } catch (err) {
      onError(err.message === "return_quantity_exceeds_sold" ? "That's more than was sold on this line." : `Could not record return (${err.message}).`);
    }
  }
  async function submitSupplierReturn(e) {
    e.preventDefault();
    setOk("");
    onError("");
    try {
      await apiSend("/api/pharmacy/returns/supplier", "POST", { stockId: Number(supForm.stockId), quantity: Number(supForm.quantity), reason: supForm.reason, notes: supForm.notes });
      setOk("Supplier return recorded — stock reduced.");
      setSupForm({ stockId: "", quantity: "", reason: "EXPIRED", notes: "" });
    } catch (err) {
      onError(err.message === "insufficient_stock" ? "Not enough stock in that batch." : `Could not record return (${err.message}).`);
    }
  }

  const pharmacyItems = (bill?.bill_items || []).filter((i) => i.stock_id);
  return (
    <div className="max-w-xl space-y-4">
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p>}
      {mode === "customer" ? (
        <>
          <form onSubmit={lookupBill} className={`${card} flex items-end gap-2`}>
            <label className={`${lab} flex-1`}>Bill number<input required placeholder="e.g. 57" value={billId} onChange={(e) => setBillId(e.target.value)} className={`${input} mt-1`} /><span className={help}>Printed on the customer&apos;s bill.</span></label>
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">Find bill</button>
          </form>
          {bill && (
            <form onSubmit={submitCustomerReturn} className={`${card} space-y-3`}>
              <p className="text-sm font-semibold">{bill.patient_name} — Bill #{bill.id}</p>
              {pharmacyItems.length === 0 ? (
                <p className="text-sm text-slate-400">No pharmacy items were sold on this bill.</p>
              ) : (
                <>
                  <label className={lab}>Item being returned
                    <select required value={custForm.billItemId} onChange={(e) => setCustForm({ ...custForm, billItemId: e.target.value })} className={`${input} mt-1`}>
                      <option value="">— choose —</option>
                      {pharmacyItems.map((it) => <option key={it.id} value={it.id}>{it.quantity} × {it.description} · ₹{it.amount}</option>)}
                    </select>
                  </label>
                  <label className={lab}>Quantity returned<input required type="number" min="1" placeholder="2" value={custForm.quantity} onChange={(e) => setCustForm({ ...custForm, quantity: e.target.value })} className={`${input} mt-1`} /></label>
                  <label className={lab}>Reason<input required placeholder="Wrong medicine" value={custForm.reason} onChange={(e) => setCustForm({ ...custForm, reason: e.target.value })} className={`${input} mt-1`} /></label>
                  <button className={primary}>Return &amp; refund</button>
                </>
              )}
            </form>
          )}
        </>
      ) : (
        <form onSubmit={submitSupplierReturn} className={`${card} space-y-3`}>
          <label className={lab}>Medicine batch
            <select required value={supForm.stockId} onChange={(e) => setSupForm({ ...supForm, stockId: e.target.value })} className={`${input} mt-1`}>
              <option value="">— choose a batch —</option>
              {rows.map((r) => <option key={r.stockId} value={r.stockId}>{r.medicineName} · batch {r.batchNumber || "—"} · {r.quantity} in stock</option>)}
            </select>
          </label>
          <label className={lab}>Quantity<input required type="number" min="1" placeholder="10" value={supForm.quantity} onChange={(e) => setSupForm({ ...supForm, quantity: e.target.value })} className={`${input} mt-1`} /></label>
          <label className={lab}>Why are you returning it?
            <select value={supForm.reason} onChange={(e) => setSupForm({ ...supForm, reason: e.target.value })} className={`${input} mt-1`}>
              {["EXPIRED", "DAMAGED", "WRONG_MEDICINE", "WRONG_BATCH", "OTHER"].map((r) => <option key={r} value={r}>{r.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</option>)}
            </select>
          </label>
          <label className={lab}>Notes<input placeholder="Credit note requested" value={supForm.notes} onChange={(e) => setSupForm({ ...supForm, notes: e.target.value })} className={`${input} mt-1`} /><span className={help}>Optional.</span></label>
          <button className={primary}>Send back to supplier</button>
        </form>
      )}
    </div>
  );
}
