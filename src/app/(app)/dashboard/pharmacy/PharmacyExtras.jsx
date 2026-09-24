"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { fmtDDMMYY } from "@/lib/dateFormat";
import BarcodeScanner from "@/components/hms/BarcodeScanner";
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
          <button onClick={() => { setDone(null); setPayBill(null); }} className="rounded-lg bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs text-[var(--hms-btn-fg)]">New sale</button>
        </div>
      </div>
    );
  }
  if (!meds) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
        <p className="text-sm font-semibold">Who is it for?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input required placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className={input} />
          <input placeholder="Phone (optional)" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className={input} />
        </div>
        <p className="pt-2 text-sm font-semibold">Medicines</p>
        <div className="flex gap-1">
          <input placeholder="Search or type a barcode" value={q} onChange={(e) => setQ(e.target.value)} className={`${input} flex-1`} />
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
            <button key={m.id} type="button" onClick={() => addToCart(m)} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-left text-sm hover:border-slate-400">
              <span className="font-medium">{m.name}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${m.stock > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{m.stock > 0 ? `Stock: ${m.stock}` : "Out of stock"}</span>
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
        <button onClick={submit} disabled={busy || !customer.name.trim() || cart.length === 0} className="w-full rounded-lg bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Complete sale</button>
        <p className="text-[11px] text-slate-400">Price + GST are taken from stock&rsquo;s selling rate / MRP and the medicine&rsquo;s GST rate.</p>
        {msg && <p className="text-xs text-red-600">{msg}</p>}
      </aside>
    </div>
  );
}

