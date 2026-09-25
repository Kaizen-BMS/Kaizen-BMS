"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { fmtDDMMYY, fmtDDMMYYTime } from "@/lib/dateFormat";
import BarcodeScanner from "@/components/hms/BarcodeScanner";
import PhoneInput from "@/components/hms/PhoneInput";
import MedicineInput from "@/components/hms/MedicineInput";
import { phoneDigitsInfo } from "@/lib/phone";
export { MedicinesTab } from "./MedicinesTab";
export { GrnTab } from "./GrnTab";
export { SuppliersTab, TransferTab, ReturnsTab } from "./PharmacyMore";

const input = "rounded-lg border border-slate-300 px-2 py-1.5 text-sm";
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
      <button onClick={pay} disabled={busy} className="rounded-lg bg-[var(--hms-btn-bg)] px-2.5 py-1 font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Take payment</button>
      {err && <span className="text-red-600">{err}</span>}
    </div>
  );
}

// Full bill — every priced line (with its own batch/MRP/purchase-rate/margin under "Price
// details"), the whole payment history (never just the latest payment), and the two actions that
// keep a running/combined bill alive: Add medicine (more lines, same bill) and Take payment
// (partial or full — CLAUDE.md pharmacy §10/§11).
export function PharmacyBillDetail({ billId, onClose, onChanged }) {
  const [bill, setBill] = useState(null);
  const [err, setErr] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = () => apiGet(`/api/pharmacy/sales/${billId}`).then((d) => setBill(d.bill)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [billId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!bill) return <p className="text-sm text-slate-400">Loading bill…</p>;

  const paid = bill.payments.reduce((s, p) => s + Number(p.amount), 0);
  const refunded = bill.refunds.reduce((s, p) => s + Number(p.amount), 0);
  const discounted = bill.discounts.reduce((s, p) => s + Number(p.amount), 0);
  const due = Math.max(0, Number(bill.total_amount) - discounted - (paid - refunded));

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">Bill #{bill.id} · {bill.patient_name}{bill.patient_phone && bill.patient_phone !== "walk-in" ? ` · ${bill.patient_phone}` : ""}</p>
          <p className="text-[11px] text-slate-400">Created {fmtDDMMYYTime(bill.created_at)}{bill.bill_items.length ? ` · last item added ${fmtDDMMYYTime(bill.bill_items[bill.bill_items.length - 1].created_at)}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/print/receipt/${bill.id}`} target="_blank" rel="noreferrer" className="rounded-md border border-slate-300 px-2.5 py-1 text-xs">Print</a>
          {onClose && <button onClick={onClose} className="text-xs text-slate-400">Close</button>}
        </div>
      </div>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
        {bill.bill_items.map((it) => {
          const margin = it.purchase_rate != null && it.unit_price != null ? Number(it.unit_price) - Number(it.purchase_rate) : null;
          return (
            <div key={it.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span>{it.description}<span className="ml-2 text-[11px] text-slate-400">{fmtDDMMYYTime(it.created_at)}</span></span>
                <span className="flex items-center gap-2">
                  <span className="font-medium tabular-nums">{rupee(it.amount)}</span>
                  {it.mrp != null && <button onClick={() => setShowBreakdown(showBreakdown === it.id ? null : it.id)} className="text-[11px] text-slate-400 underline">{showBreakdown === it.id ? "Hide" : "Price details"}</button>}
                </span>
              </div>
              {showBreakdown === it.id && (
                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500 sm:grid-cols-4">
                  <span>Qty: {it.quantity}</span>
                  <span>Purchase: {it.purchase_rate != null ? rupee(it.purchase_rate) : "—"}</span>
                  <span>MRP: {rupee(it.mrp)}</span>
                  <span>Selling: {it.unit_price != null ? rupee(it.unit_price) : "—"}</span>
                  {margin != null && <span>Margin: {rupee(margin)}</span>}
                  {it.tax_amount != null && Number(it.tax_amount) > 0 && <span>Tax: {rupee(it.tax_amount)}</span>}
                  {it.expiry_date && <span>Expiry: {fmtDDMMYY(it.expiry_date)}</span>}
                </div>
              )}
            </div>
          );
        })}
        {bill.bill_items.length === 0 && <p className="px-3 py-3 text-xs text-slate-400">No items yet.</p>}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">Total {rupee(bill.total_amount)}{discounted > 0 ? ` · Discount ${rupee(discounted)}` : ""}{refunded > 0 ? ` · Refunded ${rupee(refunded)}` : ""}</span>
        <PharmacyPayBox billId={bill.id} bill={{ total: bill.total_amount, due }} onPaid={() => { load(); onChanged?.(); }} />
      </div>

      {bill.payments.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500">Payment history</p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {bill.payments.map((p) => <li key={p.id}>{fmtDDMMYYTime(p.paid_at)} · {p.mode} · {rupee(p.amount)}</li>)}
          </ul>
        </div>
      )}

      {!bill.finalized_at && (
        adding ? (
          <AddMedicineInline billId={bill.id} onDone={() => { setAdding(false); load(); onChanged?.(); }} onCancel={() => setAdding(false)} />
        ) : (
          <button onClick={() => setAdding(true)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">+ Add medicine</button>
        )
      )}
    </div>
  );
}

// A compact medicine picker used inline inside an already-open bill, so adding a 2 PM purchase to
// a 10 AM bill doesn't leave the counter screen. Posts to the same running bill, never a new one.
function AddMedicineInline({ billId, onDone, onCancel }) {
  const [meds, setMeds] = useState(null);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { apiGet("/api/pharmacy/medicines?active=true").then((d) => setMeds(d.medicines)).catch((e) => setErr(e.message)); }, []);
  const shown = (meds || []).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 12);

  async function submit() {
    if (cart.length === 0) return;
    setBusy(true);
    setErr("");
    try {
      await apiSend(`/api/pharmacy/sales/${billId}/items`, "POST", { items: cart.map((c) => ({ medicineId: c.medicineId, quantity: c.quantity })) });
      onDone();
    } catch (e) {
      setErr(e.message.startsWith("insufficient_stock:") ? `Not enough stock: ${e.message.split(":")[1]}.` : e.message.startsWith("no_price_set:") ? `No selling price set for ${e.message.split(":")[1]}.` : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <MedicineInput value={q} onChange={setQ} onPick={(it) => { setCart((c) => (c.some((x) => x.medicineId === it.id) ? c.map((x) => (x.medicineId === it.id ? { ...x, quantity: x.quantity + 1 } : x)) : [...c, { medicineId: it.id, name: it.name, quantity: 1 }])); setQ(""); }} placeholder="Type medicine name…" className={`${input} w-full bg-white`} />
      <div className="grid max-h-40 gap-1 overflow-auto sm:grid-cols-2">
        {shown.map((m) => (
          <button key={m.id} type="button" onClick={() => setCart((c) => (c.some((x) => x.medicineId === m.id) ? c.map((x) => (x.medicineId === m.id ? { ...x, quantity: x.quantity + 1 } : x)) : [...c, { medicineId: m.id, name: m.name, quantity: 1 }]))} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-xs hover:border-slate-400">
            <span>{m.name}</span>
            <span className="text-right text-slate-400">
              {m.sellingRate != null && <span className="mr-1 font-medium text-slate-600">{rupee(m.sellingRate)}</span>}
              {m.stock}{m.unit ? ` ${m.unit}` : ""}
            </span>
          </button>
        ))}
      </div>
      {cart.length > 0 && (
        <div className="space-y-1">
          {cart.map((c) => (
            <div key={c.medicineId} className="flex items-center justify-between gap-1.5 text-xs">
              <span className="flex-1 truncate">{c.name}</span>
              <input type="number" min="1" value={c.quantity} onChange={(e) => setCart((xs) => xs.map((x) => (x.medicineId === c.medicineId ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x)))} className="w-14 rounded border border-slate-300 px-1 py-0.5" />
              <button onClick={() => setCart((xs) => xs.filter((x) => x.medicineId !== c.medicineId))} className="text-red-500">✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={busy || cart.length === 0} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Add to bill</button>
        <button onClick={onCancel} className="text-xs text-slate-400">Cancel</button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}

// ── Sell (walk-in / OTC, no prescription) ───────────────────────────
// Supports a running/combined bill: typing a phone already used earlier today offers "continue
// that bill" instead of always starting a fresh one — one bill accumulates every visit to the
// counter until the customer actually pays (CLAUDE.md pharmacy §9).
export function SellTab({ onError }) {
  const [meds, setMeds] = useState(null);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]); // [{medicineId, name, quantity}]
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [openBills, setOpenBills] = useState([]);
  const [continuingId, setContinuingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [doneBillId, setDoneBillId] = useState(null);
  const [msg, setMsg] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    apiGet("/api/pharmacy/medicines?active=true").then((d) => setMeds(d.medicines)).catch((e) => setMsg(e.message));
  }, []);

  // Look up an already-open bill the moment a full, valid phone number is typed.
  useEffect(() => {
    const { digits, valid } = phoneDigitsInfo(customer.phone);
    if (!valid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenBills([]);
      return;
    }
    let cancelled = false;
    apiGet(`/api/pharmacy/sales/open?phone=${digits}`).then((d) => { if (!cancelled) setOpenBills(d.bills); }).catch(() => {});
    return () => { cancelled = true; };
  }, [customer.phone]);

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
    if (cart.length === 0 || (!continuingId && !customer.name.trim())) return;
    setBusy(true);
    setMsg("");
    try {
      if (continuingId) {
        await apiSend(`/api/pharmacy/sales/${continuingId}/items`, "POST", { items: cart.map((c) => ({ medicineId: c.medicineId, quantity: c.quantity })) });
        setDoneBillId(continuingId);
      } else {
        const r = await apiSend("/api/pharmacy/walk-in-sale", "POST", {
          customerName: customer.name, phone: customer.phone,
          items: cart.map((c) => ({ medicineId: c.medicineId, quantity: c.quantity })),
        });
        setDoneBillId(r.billId);
      }
      setCart([]);
      setCustomer({ name: "", phone: "" });
      setContinuingId(null);
      setOpenBills([]);
    } catch (err) {
      const m = err.message.startsWith("insufficient_stock:") ? `Not enough stock: ${err.message.split(":")[1]}.`
        : err.message.startsWith("no_price_set:") ? `No selling price set yet for ${err.message.split(":")[1]} — set it in Inventory.`
        : `Could not complete the sale (${err.message}).`;
      setMsg(m);
    } finally {
      setBusy(false);
    }
  }

  if (doneBillId) {
    return (
      <div className="max-w-xl space-y-3">
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">Saved to bill #{doneBillId}.</p>
        <PharmacyBillDetail billId={doneBillId} />
        <button onClick={() => setDoneBillId(null)} className="rounded-lg bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs text-[var(--hms-btn-fg)]">New sale</button>
      </div>
    );
  }
  if (!meds) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
        <p className="text-sm font-semibold">Who is it for?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input required disabled={!!continuingId} placeholder="Customer name" value={continuingId ? openBills.find((b) => b.id === continuingId)?.customerName || "" : customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className={`${input} ${continuingId ? "bg-slate-100 text-slate-500" : ""}`} />
          <PhoneInput label="" placeholder="Phone (optional)" value={customer.phone} onChange={(v) => { setCustomer({ ...customer, phone: v }); setContinuingId(null); }} disabled={!!continuingId} />
        </div>
        {openBills.length > 0 && !continuingId && (
          <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs">
            <p className="font-medium text-amber-800">{openBills[0].customerName} already has an open bill today.</p>
            {openBills.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2">
                <span>Bill #{b.id} · {b.itemCount} item{b.itemCount === 1 ? "" : "s"} · Due {rupee(b.due)}</span>
                <button onClick={() => setContinuingId(b.id)} className="rounded-md bg-amber-600 px-2 py-0.5 font-medium text-white">Add to this bill</button>
              </div>
            ))}
          </div>
        )}
        {continuingId && (
          <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
            Adding to bill #{continuingId}. <button onClick={() => setContinuingId(null)} className="underline">Start a new bill instead</button>
          </p>
        )}
        <p className="pt-2 text-sm font-semibold">Medicines</p>
        <div className="flex gap-1">
          <div className="flex-1">
            <MedicineInput value={q} onChange={setQ} onPick={(it) => { addToCart({ id: it.id, name: it.name }); setQ(""); }} placeholder="Type medicine name, salt or barcode…" className={`${input} w-full`} />
          </div>
          <button type="button" onClick={() => setScanning(true)} className="rounded-lg border border-slate-300 px-3 text-xs">📷 Scan</button>
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
            <button key={m.id} type="button" onClick={() => addToCart(m)} title={m.mrp != null ? `MRP ₹${m.mrp}${m.purchaseRate != null ? ` · Purchase ₹${m.purchaseRate}` : ""}${m.batchCount > 1 ? ` · ${m.batchCount} batches (price shown is the next one to be used)` : ""}` : undefined} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-left text-sm hover:border-slate-400">
              <span>
                <span className="font-medium">{m.name}</span>
                <span className="block text-xs text-slate-400">
                  {m.sellingRate != null ? <span className="font-semibold text-slate-600">{rupee(m.sellingRate)}{m.unit ? ` / ${m.unit}` : ""}</span> : "No price set"}
                  {m.mrp != null && m.mrp !== m.sellingRate && <span className="ml-1.5 line-through">{rupee(m.mrp)}</span>}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${m.stock > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{m.stock > 0 ? `Stock: ${m.stock}${m.unit ? ` ${m.unit}` : ""}` : "Out of stock"}</span>
            </button>
          ))}
          {shown.length === 0 && <p className="text-xs text-slate-400">No medicines match.</p>}
        </div>
      </div>
      <aside className="h-fit space-y-2 rounded-2xl border border-slate-200 bg-white shadow-sm p-4 text-sm">
        <p className="font-semibold">Cart</p>
        {cart.length === 0 && <p className="text-xs text-slate-400">No items yet.</p>}
        {cart.map((c) => (
          <div key={c.medicineId} className="flex items-center justify-between gap-1.5 text-xs">
            <span className="flex-1 truncate">{c.name}</span>
            <input type="number" min="1" value={c.quantity} onChange={(e) => setQty(c.medicineId, Number(e.target.value))} className="w-14 rounded border border-slate-300 px-1 py-0.5" />
            <button onClick={() => removeItem(c.medicineId)} className="text-red-500">✕</button>
          </div>
        ))}
        <button onClick={submit} disabled={busy || cart.length === 0 || (!continuingId && !customer.name.trim())} className="w-full rounded-lg bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{continuingId ? `Add to bill #${continuingId}` : "Complete sale"}</button>
        <p className="text-[11px] text-slate-400">Price + GST are taken from stock&rsquo;s selling rate / MRP and the medicine&rsquo;s GST rate.</p>
        {msg && <p className="text-xs text-red-600">{msg}</p>}
      </aside>
    </div>
  );
}
