"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { fmtDDMMYY } from "@/lib/dateFormat";
import MedicineInput from "@/components/hms/MedicineInput";
import DateInput from "@/components/hms/DateInput";
import PriceFields, { EMPTY_PRICE } from "@/components/hms/PriceFields";
import { TYPE_DEFAULTS } from "@/lib/medicineTypes";

const input = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
const lab = "block text-xs font-medium text-slate-600";
const help = "mt-0.5 block text-[11px] leading-tight text-slate-400";

const emptyLine = () => ({
  quantity: "", medicineText: "", medicineId: "", batchNumber: "", manufacturingDate: "", expiryDate: "",
  freeQuantity: "0", damagedQuantity: "0", rejectedQuantity: "0", gstRate: "0", unit: "", contentUnit: "", contentPerPack: "", packagingUnset: false, purchaseUnit: "", unitsPerPurchase: 1, inPurchaseUnit: false, ...EMPTY_PRICE,
});

// Goods Received: what physically arrived. Each line reads
// Quantity · Medicine · Batch · MFD · Expiry · Purchase Rate · MRP · Margin · Selling Price.
export function GrnTab({ onError, receiveFor, onConsumedReceiveFor }) {
  const [suppliers, setSuppliers] = useState([]);
  const [openPOs, setOpenPOs] = useState([]);
  const [grns, setGrns] = useState(null);
  const [head, setHead] = useState({ supplierId: "", poId: "", supplierInvoiceNumber: "", supplierInvoiceDate: "", grnDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [lines, setLines] = useState([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const load = () => apiGet("/api/pharmacy/grn").then((d) => setGrns(d.grns));
  useEffect(() => {
    apiGet("/api/pharmacy/suppliers").then((d) => setSuppliers(d.suppliers)).catch(() => {});
    apiGet("/api/pharmacy/purchase-orders").then((d) => setOpenPOs(d.purchaseOrders.filter((p) => ["SENT", "PARTIALLY_RECEIVED"].includes(p.status)))).catch(() => {});
    load().catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming from "Receive" on a Purchase Order: one line per medicine still owed —
  // batch, dates and prices stay blank because they only exist once the stock is in hand.
  useEffect(() => {
    if (!receiveFor) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHead((h) => ({ ...h, poId: String(receiveFor.id), supplierId: receiveFor.supplierId ? String(receiveFor.supplierId) : h.supplierId }));
    const outstanding = receiveFor.items.filter((i) => i.receivedQuantity < i.quantity);
    if (outstanding.length) {
      setLines(outstanding.map((i) => ({ ...emptyLine(), medicineId: String(i.medicineId), medicineText: i.medicineName || "", quantity: String(i.quantity - i.receivedQuantity), gstRate: String(i.gstRate || 0) })));
    }
    onConsumedReceiveFor?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiveFor]);

  const setLine = (i, patch) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      const filled = lines.filter((l) => l.medicineText || l.batchNumber || l.quantity);
      for (const l of filled) {
        if (!l.medicineId) throw new Error("pick_medicine");
        if (!l.batchNumber || !l.quantity) throw new Error("incomplete_line");
        if (l.mrp && l.sellingRate && Number(l.sellingRate) > Number(l.mrp)) throw new Error("selling_price_above_mrp");
      }
      if (!filled.length) throw new Error("no_items");
      for (const l of filled) {
        if (l.packagingUnset && l.unit && l.contentUnit && Number(l.contentPerPack) > 0) {
          await apiSend(`/api/pharmacy/medicines/${l.medicineId}`, "PATCH", { unit: l.unit, contentUnit: l.contentUnit, contentPerPack: Number(l.contentPerPack) });
        }
      }
      const items = filled.map((l) => ({
        medicineId: Number(l.medicineId), batchNumber: l.batchNumber, manufacturingDate: l.manufacturingDate, expiryDate: l.expiryDate,
        receivedQuantity: Number(l.quantity), freeQuantity: Number(l.freeQuantity || 0), damagedQuantity: Number(l.damagedQuantity || 0),
        rejectedQuantity: Number(l.rejectedQuantity || 0), purchaseRate: Number(l.purchaseRate || 0), mrp: Number(l.mrp || 0),
        ...(l.sellingRate ? { sellingRate: Number(l.sellingRate) } : {}), gstRate: Number(l.gstRate || 0),
        inPurchaseUnit: !!l.inPurchaseUnit && l.unitsPerPurchase > 1,
      }));
      // Empty optional pickers must be left out, not sent as "".
      const { supplierId, poId, supplierInvoiceDate, ...rest } = head;
      const r = await apiSend("/api/pharmacy/grn", "POST", {
        ...rest, ...(supplierInvoiceDate ? { supplierInvoiceDate } : {}), ...(supplierId ? { supplierId: Number(supplierId) } : {}), ...(poId ? { poId: Number(poId) } : {}), items,
      });
      setDone(r);
      setLines([emptyLine()]);
      await load();
    } catch (err) {
      onError(
        err.message === "no_items" ? "Add at least one medicine line."
        : err.message === "pick_medicine" ? "Pick each medicine from the suggestions."
        : err.message === "incomplete_line" ? "Each line needs a quantity and a batch number."
        : err.message === "selling_price_above_mrp" ? "Selling price cannot be more than MRP."
        : `Could not save (${err.message}).`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold">Goods Received</p>
          <p className="text-xs text-slate-400">Enter what actually arrived. Only accepted units go into stock.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className={lab}>Against Purchase Order
            <select value={head.poId} onChange={(e) => setHead({ ...head, poId: e.target.value })} className={`${input} mt-1`}>
              <option value="">— none (direct purchase) —</option>
              {openPOs.map((p) => <option key={p.id} value={p.id}>{p.poNumber} · {p.supplierName || "no supplier"}</option>)}
            </select>
          </label>
          <label className={lab}>Supplier
            <select value={head.supplierId} onChange={(e) => setHead({ ...head, supplierId: e.target.value })} className={`${input} mt-1`}>
              <option value="">— optional —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className={lab}>Supplier Invoice No.
            <input placeholder="INV-2041" value={head.supplierInvoiceNumber} onChange={(e) => setHead({ ...head, supplierInvoiceNumber: e.target.value })} className={`${input} mt-1`} />
          </label>
          <div className={lab}>Invoice Date
            <DateInput value={head.supplierInvoiceDate} onChange={(v) => setHead((h) => ({ ...h, supplierInvoiceDate: v }))} className={`${input} mt-1`} />
          </div>
          <div className={lab}>Received On
            <DateInput value={head.grnDate} onChange={(v) => setHead((h) => ({ ...h, grnDate: v }))} className={`${input} mt-1`} />
          </div>
        </div>

        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className={lab}>Qty
                  <div className="mt-1 flex gap-1">
                    <input type="number" min="0" placeholder="10" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={input} />
                    {l.unitsPerPurchase > 1 && (
                      <select aria-label="Unit" value={l.inPurchaseUnit ? "P" : "S"} onChange={(e) => setLine(i, { inPurchaseUnit: e.target.value === "P" })} className="rounded-lg border border-slate-300 bg-white px-1.5 text-sm">
                        <option value="P">{l.purchaseUnit}</option><option value="S">{l.unit || "Unit"}</option>
                      </select>
                    )}
                  </div>
                  <span className={help}>{l.unitsPerPurchase > 1 && l.inPurchaseUnit && Number(l.quantity) > 0 ? `= ${Number(l.quantity) * l.unitsPerPurchase} ${l.unit || "units"} into stock. Enter rates per ${l.purchaseUnit} too.` : "Units received."}</span>
                </div>
                <div className={lab}>Medicine
                  <div className="mt-1">
                    <MedicineInput value={l.medicineText} onChange={(t) => setLine(i, { medicineText: t, medicineId: "" })} onPick={(it) => {
                      // Same type-based suggestion as Inventory's quick stock-in — filled in once, remembered
                      // on the medicine when this GRN is saved, never asked again after that.
                      const has = it.unit && it.contentUnit;
                      const d = TYPE_DEFAULTS[it.type] || TYPE_DEFAULTS.Other;
                      setLine(i, {
                        medicineId: String(it.id), medicineText: it.name,
                        unit: has ? it.unit : d.unit, contentUnit: has ? it.contentUnit : d.contentUnit,
                        contentPerPack: has ? it.contentPerPack : (d.contentPerPack || ""), packagingUnset: !has,
                        purchaseUnit: it.purchaseUnit || "", unitsPerPurchase: it.unitsPerPurchase || 1, inPurchaseUnit: (it.unitsPerPurchase || 1) > 1,
                      });
                    }} placeholder="Cap Betadine 500 mg" className={input} />
                  </div>
                  <span className={help}>Start typing and pick.</span>
                </div>
                <label className={lab}>Batch No.
                  <input placeholder="BTD001" value={l.batchNumber} onChange={(e) => setLine(i, { batchNumber: e.target.value })} className={`${input} mt-1`} />
                  <span className={help}>Printed on the pack.</span>
                </label>
                <div className={lab}>MFD
                  <DateInput value={l.manufacturingDate} onChange={(v) => setLine(i, { manufacturingDate: v })} className={`${input} mt-1`} />
                  <span className={help}>DD/MM/YY</span>
                </div>
                <div className={lab}>Expiry
                  <DateInput value={l.expiryDate} onChange={(v) => setLine(i, { expiryDate: v })} className={`${input} mt-1`} />
                  <span className={help}>Expiry date on the pack.</span>
                </div>
                {l.medicineId && (
                  <div className="rounded-lg border border-slate-200 bg-white p-2 sm:col-span-2 lg:col-span-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs font-medium text-slate-600">Sold as<input placeholder="Strip" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value, packagingUnset: true })} className={`${input} mt-1 w-28`} /></label>
                      <label className="text-xs font-medium text-slate-600">Contains<input type="number" min="1" placeholder="10" value={l.contentPerPack} onChange={(e) => setLine(i, { contentPerPack: e.target.value, packagingUnset: true })} className={`${input} mt-1 w-20`} /></label>
                      <label className="text-xs font-medium text-slate-600">Per {l.unit || "unit"}<input placeholder="Tablet" value={l.contentUnit} onChange={(e) => setLine(i, { contentUnit: e.target.value, packagingUnset: true })} className={`${input} mt-1 w-24`} /></label>
                      {l.packagingUnset && <span className="pb-1.5 text-[11px] text-amber-700">Not set on this medicine yet — saving will remember it.</span>}
                    </div>
                  </div>
                )}
                <PriceFields value={l} onChange={(p) => setLine(i, p)} quantity={l.quantity} unitName={(l.inPurchaseUnit && l.unitsPerPurchase > 1 ? l.purchaseUnit : l.unit || "unit").toLowerCase()} contentUnit={l.contentUnit} contentPerPack={l.contentPerPack ? Number(l.contentPerPack) * (l.inPurchaseUnit && l.unitsPerPurchase > 1 ? l.unitsPerPurchase : 1) : null} />
              </div>
              <details className="mt-3 text-xs text-slate-500">
                <summary className="cursor-pointer select-none">More options (free units, damaged, rejected, GST)</summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-4">
                  <label className={lab}>Free units<input type="number" min="0" value={l.freeQuantity} onChange={(e) => setLine(i, { freeQuantity: e.target.value })} className={`${input} mt-1`} /></label>
                  <label className={lab}>Damaged<input type="number" min="0" value={l.damagedQuantity} onChange={(e) => setLine(i, { damagedQuantity: e.target.value })} className={`${input} mt-1`} /></label>
                  <label className={lab}>Rejected<input type="number" min="0" value={l.rejectedQuantity} onChange={(e) => setLine(i, { rejectedQuantity: e.target.value })} className={`${input} mt-1`} /></label>
                  <label className={lab}>GST<select value={l.gstRate} onChange={(e) => setLine(i, { gstRate: e.target.value })} className={`${input} mt-1`}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</select></label>
                </div>
              </details>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setLines((xs) => [...xs, emptyLine()])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">+ Add another medicine</button>
            {lines.length > 1 && <button type="button" onClick={() => setLines((xs) => xs.slice(0, -1))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">Remove last</button>}
          </div>
        </div>
        <textarea placeholder="Notes (optional)" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} className={input} rows={2} />
        <button disabled={busy} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{busy ? "Saving…" : "Save & add to stock"}</button>
        {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved as {done.grnNumber}. Only accepted units (received + free − damaged − rejected) were added to stock.</p>}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2.5">GRN #</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Supplier</th><th className="px-3 py-2.5">Invoice #</th><th className="px-3 py-2.5">Lines</th><th className="px-3 py-2.5">Accepted units</th></tr>
          </thead>
          <tbody>
            {grns === null && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>}
            {grns?.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Nothing received yet.</td></tr>}
            {grns?.map((g) => (
              <tr key={g.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium">{g.grnNumber}</td>
                <td className="px-3 py-2 tabular-nums">{fmtDDMMYY(g.grnDate)}</td>
                <td className="px-3 py-2">{g.supplierName || "—"}</td>
                <td className="px-3 py-2">{g.supplierInvoiceNumber || "—"}</td>
                <td className="px-3 py-2">{g.itemCount}</td>
                <td className="px-3 py-2 tabular-nums">{g.totalAccepted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
