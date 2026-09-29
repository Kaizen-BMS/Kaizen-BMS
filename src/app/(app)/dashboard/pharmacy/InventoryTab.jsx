"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import { fmtDDMMYY } from "@/lib/dateFormat";
import { MEDICINE_TYPES } from "@/lib/medicineTypes";
import { marginFromSelling } from "@/lib/pharmacyPricing";
import { TYPE_DEFAULTS } from "@/lib/medicineTypes";
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

const BLANK = { medicineText: "", medicineId: "", batchNumber: "", manufacturingDate: "", expiryDate: "", quantity: "", location: "", unit: "", contentUnit: "", contentPerPack: "", packagingUnset: false, enterAsContent: false, ...EMPTY_PRICE };

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
  // One combined "Edit" per batch, instead of three separate mini-forms
  // (batch details / price / quantity) that each needed their own click to
  // open and their own Save — everything editable about a batch lives in
  // one form now. Quantity is still its own thing underneath (an optional
  // ± delta with a required reason, exactly as before) since that's a
  // genuinely different kind of change (stock leaving/entering, always
  // audited) from correcting a typo in the batch's own fields — but it no
  // longer needs a separate open/close toggle to get to.
  const [editForm, setEditForm] = useState(null);
  function openEdit(r) {
    setEditForm({
      stockId: r.stockId,
      batchNumber: r.batchNumber || "",
      manufacturingDate: r.manufacturingDate ? String(r.manufacturingDate).slice(0, 10) : "",
      expiryDate: r.expiryDate ? String(r.expiryDate).slice(0, 10) : "",
      purchaseRate: r.purchaseRate != null ? String(r.purchaseRate) : "",
      rack: r.rack || "",
      mrp: r.mrp != null ? String(r.mrp) : "",
      sellingRate: r.sellingRate != null ? String(r.sellingRate) : (r.mrp != null ? String(r.mrp) : ""),
      applyPriceToMedicine: true,
      qtyDelta: "",
      qtyCategory: "OTHER",
      qtyReason: "",
    });
  }

  async function saveEdit(original) {
    if (!editForm) return;
    if (editForm.qtyDelta && !editForm.qtyReason.trim()) return onError("Give a reason for the quantity change.");
    if (editForm.mrp && editForm.sellingRate && Number(editForm.sellingRate) > Number(editForm.mrp)) return onError("Selling price cannot be more than MRP.");
    setBusy(true);
    onError("");
    const notes = [];
    try {
      const detailsChanged =
        editForm.batchNumber !== (original.batchNumber || "") ||
        editForm.manufacturingDate !== (original.manufacturingDate ? String(original.manufacturingDate).slice(0, 10) : "") ||
        editForm.expiryDate !== (original.expiryDate ? String(original.expiryDate).slice(0, 10) : "") ||
        (editForm.purchaseRate !== "" && Number(editForm.purchaseRate) !== Number(original.purchaseRate ?? NaN)) ||
        editForm.rack !== (original.rack || "");
      if (detailsChanged) {
        await apiSend(`/api/pharmacy/stock/${editForm.stockId}/details`, "PATCH", {
          batchNumber: editForm.batchNumber,
          manufacturingDate: editForm.manufacturingDate,
          expiryDate: editForm.expiryDate,
          ...(editForm.purchaseRate !== "" ? { purchaseRate: Number(editForm.purchaseRate) } : {}),
          rack: editForm.rack,
        });
        notes.push("details");
      }

      const priceChanged = editForm.mrp !== "" && editForm.sellingRate !== "" && (Number(editForm.mrp) !== Number(original.mrp ?? NaN) || Number(editForm.sellingRate) !== Number(original.sellingRate ?? original.mrp ?? NaN));
      if (priceChanged) {
        const res = await apiSend(`/api/pharmacy/stock/${editForm.stockId}/price`, "PATCH", { mrp: Number(editForm.mrp), sellingRate: Number(editForm.sellingRate), applyToMedicine: editForm.applyPriceToMedicine });
        notes.push(`price (${res.updated} batch${res.updated === 1 ? "" : "es"})`);
      }

      if (editForm.qtyDelta) {
        await apiSend(`/api/pharmacy/stock/${editForm.stockId}`, "PATCH", { delta: Number(editForm.qtyDelta), reason: editForm.qtyReason, category: editForm.qtyCategory });
        notes.push("quantity");
      }

      setOk(notes.length ? `Updated: ${notes.join(", ")}.` : "Nothing changed.");
      setEditForm(null);
      await load();
    } catch (err) {
      onError(
        err.message === "batch_number_taken" ? "That batch number is already used for this medicine."
        : err.message === "selling_price_above_mrp" ? "Selling price cannot be more than MRP."
        : err.message === "quantity_cannot_go_negative" ? "That would take the quantity below zero."
        : `Could not save (${err.message}).`,
      );
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
      // MRP is always per-Strip; Selling follows whatever unit is currently
      // active (per-content-unit when enterAsContent) — normalize Selling
      // up to per-Strip before comparing, same conversion the server
      // applies to it (never to MRP — see the stock route's own comment).
      const sellingPerStrip = form.enterAsContent && Number(form.contentPerPack) > 1 ? Number(form.sellingRate || 0) * Number(form.contentPerPack) : Number(form.sellingRate || 0);
      if (form.mrp && form.sellingRate && sellingPerStrip > Number(form.mrp)) throw new Error("selling_price_above_mrp");
      if (form.packagingUnset && form.unit && form.contentUnit && Number(form.contentPerPack) > 0) {
        await apiSend(`/api/pharmacy/medicines/${form.medicineId}`, "PATCH", { unit: form.unit, contentUnit: form.contentUnit, contentPerPack: Number(form.contentPerPack) });
      }
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
        ...(form.enterAsContent ? { inContentUnit: true } : {}),
      });
      setOk(`Added ${form.quantity} × ${form.medicineText} (batch ${form.batchNumber}).`);
      setForm(BLANK);
      await load();
    } catch (err) {
      onError(
        err.message === "pick_a_medicine" ? "Pick the medicine from the suggestions (add it in Medicine Listing first if it isn't there)."
        : err.message === "selling_price_above_mrp" ? "Selling price cannot be more than MRP."
        : err.message.startsWith("quantity_not_whole_") ? `That's not a whole number of ${form.unit || "units"} — check the ${form.contentUnit?.toLowerCase() || "unit"} count.`
        : err.message === "no_content_unit_set" ? "Set how many units this medicine's pack contains first (below), then save again."
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
              <div className={label}>Quantity
                <div className="mt-1 flex gap-1">
                  <input type="number" min="1" required placeholder="100" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={input} />
                  {form.contentUnit && Number(form.contentPerPack) > 1 && (
                    <select aria-label="Counted in" value={form.enterAsContent ? "C" : "U"} onChange={(e) => setForm((f) => ({ ...f, enterAsContent: e.target.value === "C" }))} className="shrink-0 rounded-lg border border-slate-300 bg-white px-1.5 text-sm">
                      <option value="U">{form.unit || "unit"}</option>
                      <option value="C">{form.contentUnit}</option>
                    </select>
                  )}
                </div>
                <span className={help}>
                  {form.enterAsContent && Number(form.contentPerPack) > 1 && Number(form.quantity) > 0
                    ? `= ${(Number(form.quantity) / Number(form.contentPerPack)).toFixed(2)} ${form.unit || "unit"} into stock (must be a whole number).`
                    : `How many ${form.enterAsContent ? (form.contentUnit || "").toLowerCase() : (form.unit || "unit").toLowerCase()}${form.quantity === "1" ? "" : "s"} you are adding.`}
                </span>
              </div>
              <div className={label}>
                Medicine
                <div className="mt-1">
                  <MedicineInput value={form.medicineText} onChange={(t) => setForm((f) => ({ ...f, medicineText: t, medicineId: "" }))} onPick={(it) => {
                    // A medicine that's never had its packaging set gets the same type-based
                    // suggestion the Medicine List uses (a Tablet -> Strip of 10, ...) — filled in
                    // here so a pharmacist never has to redo it, and remembered on the medicine the
                    // moment this batch is saved (never asked again after that).
                    const has = it.unit && it.contentUnit;
                    const d = TYPE_DEFAULTS[it.type] || TYPE_DEFAULTS.Other;
                    setForm((f) => ({
                      ...f, medicineId: String(it.id), medicineText: it.name,
                      unit: has ? it.unit : d.unit, contentUnit: has ? it.contentUnit : d.contentUnit,
                      contentPerPack: has ? it.contentPerPack : (d.contentPerPack || ""), packagingUnset: !has,
                    }));
                  }} placeholder="Cap Betadine 500 mg" className={input} />
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
              {form.medicineId && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 sm:col-span-2 lg:col-span-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs font-medium text-slate-600">Sold as<input placeholder="Strip" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value, packagingUnset: true }))} className={`${input} mt-1 w-28`} /></label>
                    <label className="text-xs font-medium text-slate-600">Contains<input type="number" min="1" placeholder="10" value={form.contentPerPack} onChange={(e) => setForm((f) => ({ ...f, contentPerPack: e.target.value, packagingUnset: true }))} className={`${input} mt-1 w-20`} /></label>
                    <label className="text-xs font-medium text-slate-600">Per {form.unit || "unit"}<input placeholder="Tablet" value={form.contentUnit} onChange={(e) => setForm((f) => ({ ...f, contentUnit: e.target.value, packagingUnset: true }))} className={`${input} mt-1 w-24`} /></label>
                    {form.packagingUnset && <span className="pb-1.5 text-[11px] text-amber-700">Not set on this medicine yet — saving this batch will remember it.</span>}
                  </div>
                </div>
              )}
              <PriceFields
                value={form}
                onChange={(p) => setForm((f) => ({ ...f, ...p }))}
                quantity={form.quantity}
                unitName={(form.enterAsContent ? form.contentUnit : form.unit || "unit").toLowerCase()}
                // MRP is printed on the pack at the STOCK unit (a Strip, a
                // Bottle, a Tube) — never per-tablet — so it always asks for
                // that, regardless of which unit quantity/cost are being
                // entered in right now (CLAUDE.md-worthy gotcha: entering
                // MRP "per tablet" and letting the software scale it up
                // silently produces a wildly wrong strip MRP).
                mrpUnitName={(form.unit || "unit").toLowerCase()}
                mrpPer={form.enterAsContent && Number(form.contentPerPack) > 1 ? Number(form.contentPerPack) : 1}
                contentUnit={form.contentUnit}
                contentPerPack={Number(form.contentPerPack) || null}
                levels={form.enterAsContent && Number(form.contentPerPack) > 1 ? [
                  { label: (form.contentUnit || "unit").toLowerCase(), per: 1 },
                  { label: (form.unit || "unit").toLowerCase(), per: 1 / Number(form.contentPerPack) },
                ] : undefined}
              />
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
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => {
                          const closing = open === r.stockId;
                          setOpen(closing ? null : r.stockId);
                          if (closing) setEditForm(null);
                          else if (canAdjust) openEdit(r);
                        }}
                        className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
                      >
                        {open === r.stockId ? "Hide" : canAdjust ? "Edit" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {open === r.stockId && (
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <td colSpan={11} className="px-4 py-3 text-xs text-slate-600">
                        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                          <span>{r.type}{r.strength ? ` · ${r.strength}` : ""}</span>
                          {r.genericName && <span>Salt: {r.genericName}</span>}
                          {r.manufacturer && <span>By: {r.manufacturer}</span>}
                          {canAdjust && (
                            <label className="flex items-center gap-1.5">Alert when stock reaches
                              <input type="number" min="0" defaultValue={r.reorderLevel} onBlur={(e) => saveThreshold(r.medicineName, Number(e.target.value))} className="w-16 rounded-md border border-slate-300 px-1.5 py-0.5" />
                            </label>
                          )}
                        </div>

                        {/* Everything about this batch, in one place — no
                            separate toggles for details / price / quantity. */}
                        {canAdjust && editForm?.stockId === r.stockId && (
                          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                            <div className="flex flex-wrap items-end gap-2">
                              <label>Batch No.<input value={editForm.batchNumber} onChange={(e) => setEditForm((s) => ({ ...s, batchNumber: e.target.value }))} className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1" /></label>
                              <label>MFD<DateInput value={editForm.manufacturingDate} onChange={(v) => setEditForm((s) => ({ ...s, manufacturingDate: v }))} className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1" /></label>
                              <label>Expiry<DateInput value={editForm.expiryDate} onChange={(v) => setEditForm((s) => ({ ...s, expiryDate: v }))} className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1" /></label>
                              <label>Purchase rate (₹)<input type="number" min="0" step="0.01" value={editForm.purchaseRate} onChange={(e) => setEditForm((s) => ({ ...s, purchaseRate: e.target.value }))} className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1" /></label>
                              <label>Location<input value={editForm.rack} onChange={(e) => setEditForm((s) => ({ ...s, rack: e.target.value }))} placeholder="Rack A - Shelf 3" className="mt-1 block w-36 rounded-md border border-slate-300 px-2 py-1" /></label>
                            </div>
                            <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
                              <label>MRP (₹)<input type="number" min="0" step="0.01" value={editForm.mrp} onChange={(e) => setEditForm((s) => ({ ...s, mrp: e.target.value }))} className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1" /></label>
                              <label>Selling price (₹)<input type="number" min="0" step="0.01" value={editForm.sellingRate} onChange={(e) => setEditForm((s) => ({ ...s, sellingRate: e.target.value }))} className={`mt-1 block w-28 rounded-md border px-2 py-1 ${editForm.mrp && Number(editForm.sellingRate) > Number(editForm.mrp) ? "border-red-400 bg-red-50" : "border-slate-300"}`} /></label>
                              <label className="flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={editForm.applyPriceToMedicine} onChange={(e) => setEditForm((s) => ({ ...s, applyPriceToMedicine: e.target.checked }))} />Apply price to all batches of this medicine</label>
                              {editForm.purchaseRate !== "" && Number(editForm.sellingRate) > 0 && <span className="pb-1.5 text-slate-400">Margin {rupee(Number(editForm.sellingRate) - Number(editForm.purchaseRate))} on purchase {rupee(editForm.purchaseRate)}</span>}
                            </div>
                            <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
                              <label>± Quantity<input type="number" value={editForm.qtyDelta} onChange={(e) => setEditForm((s) => ({ ...s, qtyDelta: e.target.value }))} className="mt-1 block w-24 rounded-md border border-slate-300 px-2 py-1" /></label>
                              <label>Category
                                <select value={editForm.qtyCategory} onChange={(e) => setEditForm((s) => ({ ...s, qtyCategory: e.target.value }))} className="mt-1 block rounded-md border border-slate-300 px-2 py-1">
                                  <option value="DAMAGED">Damaged</option><option value="EXPIRED_WRITEOFF">Expired write-off</option>
                                  <option value="COUNT_CORRECTION">Count correction</option><option value="OTHER">Other</option>
                                </select>
                              </label>
                              <label className="min-w-[10rem] flex-1">Reason (needed only if quantity changes)<input value={editForm.qtyReason} onChange={(e) => setEditForm((s) => ({ ...s, qtyReason: e.target.value }))} placeholder="Why is the count changing?" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1" /></label>
                              {editForm.qtyDelta !== "" && <span className="pb-1.5 text-slate-400">Now {r.quantity} → {r.quantity + (Number(editForm.qtyDelta) || 0)}</span>}
                            </div>
                            <div className="flex items-center gap-2 border-t border-slate-200 pt-3">
                              <button onClick={() => saveEdit(r)} disabled={busy || !editForm.batchNumber} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
                              <button onClick={() => setEditForm(null)} className="px-2 py-1.5 text-slate-500">Cancel</button>
                            </div>
                          </div>
                        )}
                        {!canAdjust && <div className="mt-2">Location: {[r.rack, r.shelf, r.bin].filter(Boolean).join(" - ") || "—"}</div>}
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
