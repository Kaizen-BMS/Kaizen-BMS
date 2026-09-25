"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import { fmtDDMMYY } from "@/lib/dateFormat";
import { MEDICINE_TYPES } from "@/lib/medicineTypes";
import { marginFromSelling, tabletsFromPack } from "@/lib/pharmacyPricing";
import MedicineInput from "@/components/hms/MedicineInput";
import DateInput from "@/components/hms/DateInput";
import PriceFields, { EMPTY_PRICE } from "@/components/hms/PriceFields";

const STATUS_BADGE = {
  EXPIRED: "bg-red-100 text-red-700",
  EXPIRY_SOON: "bg-orange-100 text-orange-700",
  LOW_STOCK: "bg-yellow-100 text-yellow-800",
  OUT_OF_STOCK: "bg-slate-200 text-slate-600",
  IN_STOCK: "bg-emerald-100 text-emerald-700",
};
const STATUS_TEXT = {
  EXPIRED: "🔴 Expired",
  EXPIRY_SOON: "🟠 Expiry Soon",
  LOW_STOCK: "🟡 Low Stock",
  OUT_OF_STOCK: "Out of Stock",
  IN_STOCK: "In Stock",
};
const QUICK_FILTERS = [
  ["", "All"],
  ["low", "🟡 Low Stock"],
  ["expiring", "🟠 Expiry Soon"],
  ["expired", "🔴 Expired"],
  ["out", "Out of Stock"],
  ["in", "In Stock"],
];

const input = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
const label = "block text-xs font-medium text-slate-600";
const help = "mt-0.5 block text-[11px] leading-tight text-slate-400";
const rupee = (n) => (n != null ? `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—");

const BLANK = { medicineText: "", medicineId: "", batchNumber: "", manufacturingDate: "", expiryDate: "", quantity: "", location: "", ...EMPTY_PRICE };

// One line per batch: Qty · Medicine · Batch · MFD · Expiry · Purchase Rate · MRP · Margin · Selling Price · Status.
// Everything else (type, salt, location, reorder level, adjust) opens under "Details".
export default function InventoryTab({ canStockIn, canAdjust, initialFilter, onError }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [filter, setFilter] = useState(initialFilter || "");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [open, setOpen] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ delta: "", reason: "", category: "OTHER" });
  const [priceForm, setPriceForm] = useState({ stockId: null, mrp: "", sellingRate: "", all: true });
  async function savePrice(r) {
    setBusy(true);
    onError("");
    try {
      if (Number(priceForm.sellingRate) > Number(priceForm.mrp)) throw new Error("selling_price_above_mrp");
      const res = await apiSend(`/api/pharmacy/stock/${r.stockId}/price`, "PATCH", { mrp: Number(priceForm.mrp), sellingRate: Number(priceForm.sellingRate), applyToMedicine: priceForm.all });
      setOk(`Price updated on ${res.updated} batch${res.updated === 1 ? "" : "es"}.`);
      setPriceForm({ stockId: null, mrp: "", sellingRate: "", all: true });
      await load();
    } catch (err) {
      onError(err.message === "selling_price_above_mrp" ? "Selling price cannot be more than MRP." : `Could not change the price (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  // A slow earlier search must never overwrite a later one.
  const genRef = useRef(0);
  async function load() {
    const gen = ++genRef.current;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (filter) params.set("filter", filter);
    const d = await apiGet(`/api/pharmacy/inventory?${params.toString()}`);
    if (genRef.current === gen) setRows(d.rows);
  }
  useEffect(() => {
    load().catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type, filter]);
  useRealtime({ "stock:updated": load, "dispense:created": load, "threshold:updated": load }, load);

  async function submitStockIn(e) {
    e.preventDefault();
    setBusy(true);
    onError("");
    setOk("");
    try {
      if (!form.medicineId) throw new Error("pick_a_medicine");
      if (form.mrp && form.sellingRate && Number(form.sellingRate) > Number(form.mrp)) throw new Error("selling_price_above_mrp");
      await apiSend("/api/pharmacy/stock", "POST", {
        medicineName: form.medicineText,
        medicineId: Number(form.medicineId),
        batchNumber: form.batchNumber,
        manufacturingDate: form.manufacturingDate,
        expiryDate: form.expiryDate,
        quantity: form.quantity,
        ...(form.purchaseRate ? { purchaseRate: Number(form.purchaseRate) } : {}),
        ...(form.mrp ? { mrp: Number(form.mrp) } : {}),
        ...(form.sellingRate ? { sellingRate: Number(form.sellingRate) } : {}),
        ...(form.location ? { rack: form.location } : {}),
      });
      setOk(`Added ${form.quantity} × ${form.medicineText} (batch ${form.batchNumber}).`);
      setForm(BLANK);
      await load();
    } catch (err) {
      onError(
        err.message === "pick_a_medicine" ? "Pick the medicine from the suggestions (add it in Medicine List first if it isn't there)."
        : err.message === "selling_price_above_mrp" ? "Selling price cannot be more than MRP."
        : err.message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveThreshold(medicineName, value) {
    try {
      await apiSend("/api/pharmacy/thresholds", "PUT", { medicineName, lowStockThreshold: value });
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  async function submitAdjustment(stockId) {
    setBusy(true);
    try {
      await apiSend(`/api/pharmacy/stock/${stockId}`, "PATCH", { delta: Number(adjustForm.delta), reason: adjustForm.reason, category: adjustForm.category });
      setAdjustForm({ delta: "", reason: "", category: "OTHER" });
      await load();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canStockIn && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <button onClick={() => setShowAdd((v) => !v)} className="flex w-full items-center justify-between text-left text-sm font-semibold">
            <span>Add stock to a batch</span>
            <span className="text-slate-400">{showAdd ? "−" : "+"}</span>
          </button>
          {ok && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{ok}</p>}
          {showAdd && (
            <form onSubmit={submitStockIn} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className={label}>Quantity
                <input type="number" min="1" required placeholder="100" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={`${input} mt-1`} />
                <span className={help}>How many units you are adding.</span>
              </label>
              <div className={label}>
                Medicine
                <div className="mt-1">
                  <MedicineInput value={form.medicineText} onChange={(t) => setForm((f) => ({ ...f, medicineText: t, medicineId: "" }))} onPick={(it) => setForm((f) => ({ ...f, medicineId: String(it.id), medicineText: it.name, packSize: it.packSize || "", unit: it.unit || "" }))} placeholder="Cap Betadine 500 mg" className={input} />
                </div>
                <span className={help}>Start typing — pick from the list.</span>
              </div>
              <label className={label}>Batch No.
                <input required placeholder="BTD001" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} className={`${input} mt-1`} />
                <span className={help}>Batch number printed on the pack.</span>
              </label>
              <div className={label}>MFD
                <DateInput value={form.manufacturingDate} onChange={(v) => setForm((f) => ({ ...f, manufacturingDate: v }))} className={`${input} mt-1`} />
                <span className={help}>Manufacturing date, DD/MM/YY.</span>
              </div>
              <div className={label}>Expiry
                <DateInput value={form.expiryDate} onChange={(v) => setForm((f) => ({ ...f, expiryDate: v }))} className={`${input} mt-1`} />
                <span className={help}>Expiry date printed on the pack.</span>
              </div>
              <PriceFields value={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} quantity={form.quantity} unitName={(form.unit || "unit").toLowerCase()} tabletsPerUnit={tabletsFromPack(form.packSize)} />
              <label className={label}>Location
                <input placeholder="Rack A - Shelf 3" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={`${input} mt-1`} />
                <span className={help}>Where it is kept (optional).</span>
              </label>
              <div className="flex items-end">
                <button disabled={busy} className="w-full rounded-lg bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{busy ? "Adding…" : "Add to stock"}</button>
              </div>
            </form>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <input placeholder="Search medicine, salt, brand, batch, barcode, location…" value={q} onChange={(e) => setQ(e.target.value)} className={`${input} min-w-[16rem] flex-1`} />
        <select value={type} onChange={(e) => setType(e.target.value)} className={`${input} w-auto`}>
          <option value="">All types</option>
          {MEDICINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex flex-wrap gap-1">
          {QUICK_FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter === k ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Qty</th><th className="px-3 py-2.5">Medicine</th><th className="px-3 py-2.5">Batch</th>
              <th className="px-3 py-2.5">MFD</th><th className="px-3 py-2.5">Expiry</th><th className="px-3 py-2.5">Purchase Rate</th>
              <th className="px-3 py-2.5">MRP</th><th className="px-3 py-2.5">Margin</th><th className="px-3 py-2.5">Selling Price</th>
              <th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-400">Loading stock…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-400">No batches match. {canStockIn ? "Use “Add stock to a batch” above." : ""}</td></tr>}
            {rows?.map((r) => {
              const m = marginFromSelling(r.purchaseRate, r.sellingRate);
              return (
                <Fragment key={r.stockId}>
                  <tr className="border-b border-slate-100 transition hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-semibold tabular-nums">{r.quantity}{r.unit ? <span className="ml-1 text-[11px] font-normal text-slate-400">{r.unit}</span> : null}
                      {r.purchaseUnit && r.unitsPerPurchase > 1 && r.quantity >= r.unitsPerPurchase && <span className="block text-[11px] font-normal text-slate-400">= {Math.floor(r.quantity / r.unitsPerPurchase)} {r.purchaseUnit}{r.quantity % r.unitsPerPurchase ? ` + ${r.quantity % r.unitsPerPurchase} ${r.unit || ""}` : ""}</span>}</td>
                    <td className="px-3 py-2 font-medium">{r.medicineName}</td>
                    <td className="px-3 py-2">{r.batchNumber || "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtDDMMYY(r.manufacturingDate)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtDDMMYY(r.expiryDate)}</td>
                    <td className="px-3 py-2 tabular-nums">{rupee(r.purchaseRate)}</td>
                    <td className="px-3 py-2 tabular-nums">{rupee(r.mrp)}</td>
                    <td className="px-3 py-2 tabular-nums">{m ? `${rupee(m.amount)} / ${m.percent}%` : "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{rupee(r.sellingRate ?? r.mrp)}</td>
                    <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>{STATUS_TEXT[r.status]}</span></td>
                    <td className="px-3 py-2 text-right"><button onClick={() => setOpen(open === r.stockId ? null : r.stockId)} className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100">{open === r.stockId ? "Hide" : "Details"}</button></td>
                  </tr>
                  {open === r.stockId && (
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <td colSpan={11} className="px-4 py-3 text-xs text-slate-600">
                        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                          <span>{r.type}{r.strength ? ` · ${r.strength}` : ""}</span>
                          {r.genericName && <span>Salt: {r.genericName}</span>}
                          {r.manufacturer && <span>By: {r.manufacturer}</span>}
                          <span>Location: {[r.rack, r.shelf, r.bin].filter(Boolean).join(" - ") || "—"}</span>
                          {canAdjust && (
                            <label className="flex items-center gap-1.5">Alert when stock reaches
                              <input type="number" min="0" defaultValue={r.reorderLevel} onBlur={(e) => saveThreshold(r.medicineName, Number(e.target.value))} className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5" />
                            </label>
                          )}
                        </div>
                        {canAdjust && (
                          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
                            <span className="w-full font-medium text-slate-500">Change price</span>
                            {priceForm.stockId === r.stockId ? (
                              <>
                                <label>MRP (₹)<input type="number" min="0" step="0.01" value={priceForm.mrp} onChange={(e) => setPriceForm((s) => ({ ...s, mrp: e.target.value }))} className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1" /></label>
                                <label>Selling price (₹)<input type="number" min="0" step="0.01" value={priceForm.sellingRate} onChange={(e) => setPriceForm((s) => ({ ...s, sellingRate: e.target.value }))} className={`mt-1 block w-28 rounded-md border px-2 py-1 ${Number(priceForm.sellingRate) > Number(priceForm.mrp) ? "border-red-400 bg-red-50" : "border-slate-300"}`} /></label>
                                <label className="flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={priceForm.all} onChange={(e) => setPriceForm((s) => ({ ...s, all: e.target.checked }))} />Apply to all batches of this medicine</label>
                                <button onClick={() => savePrice(r)} disabled={busy || !priceForm.mrp || !priceForm.sellingRate} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Save price</button>
                                <button onClick={() => setPriceForm({ stockId: null, mrp: "", sellingRate: "", all: true })} className="px-2 py-1.5 text-slate-500">Cancel</button>
                                {r.purchaseRate != null && Number(priceForm.sellingRate) > 0 && <span className="pb-1.5 text-slate-400">Margin {rupee(Number(priceForm.sellingRate) - Number(r.purchaseRate))} on purchase {rupee(r.purchaseRate)}</span>}
                              </>
                            ) : (
                              <button onClick={() => setPriceForm({ stockId: r.stockId, mrp: String(r.mrp ?? ""), sellingRate: String(r.sellingRate ?? r.mrp ?? ""), all: true })} className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-white">MRP {rupee(r.mrp)} · Selling {rupee(r.sellingRate ?? r.mrp)} — Change</button>
                            )}
                          </div>
                        )}
                        {canAdjust && (
                          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
                            <label>± Quantity<input type="number" value={adjustForm.delta} onChange={(e) => setAdjustForm((s) => ({ ...s, delta: e.target.value }))} className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1" /></label>
                            <label>Category
                              <select value={adjustForm.category} onChange={(e) => setAdjustForm((s) => ({ ...s, category: e.target.value }))} className="mt-1 block rounded-md border border-slate-300 px-2 py-1">
                                <option value="DAMAGED">Damaged</option><option value="EXPIRED_WRITEOFF">Expired write-off</option>
                                <option value="COUNT_CORRECTION">Count correction</option><option value="OTHER">Other</option>
                              </select>
                            </label>
                            <label className="min-w-[10rem] flex-1">Reason<input value={adjustForm.reason} onChange={(e) => setAdjustForm((s) => ({ ...s, reason: e.target.value }))} placeholder="Why is the count changing?" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1" /></label>
                            <button onClick={() => submitAdjustment(r.stockId)} disabled={busy || !adjustForm.delta || !adjustForm.reason} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Adjust stock</button>
                            <span className="text-slate-400">Now {r.quantity} → {r.quantity + (Number(adjustForm.delta) || 0)}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
