"use client";

import { useEffect } from "react";
import { sellingFromMargin, marginFromSelling } from "@/lib/pharmacyPricing";

const inp = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";

export const EMPTY_PRICE = { totalPaid: "", purchaseRate: "", mrp: "", marginMode: "amount", margin: "", sellingRate: "" };

// Purchase Rate -> MRP -> Margin (₹ or %) -> Selling Price. Selling price is
// worked out for you and can never go above MRP; type a selling price and the
// margin is worked out instead.
export default function PriceFields({ value, onChange, compact = false, quantity, unitName = "unit", tabletsPerUnit }) {
  const v = { ...EMPTY_PRICE, ...value };
  const qty = Number(quantity);
  const total = Number(v.totalPaid);
  // "I paid ₹X for all of it" -> the per-unit purchase rate works itself out (and follows the quantity).
  const derivedRate = total > 0 && qty > 0 ? String(Math.round((total / qty) * 100) / 100) : null;
  useEffect(() => {
    if (derivedRate != null && derivedRate !== v.purchaseRate) recompute({ purchaseRate: derivedRate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedRate]);

  function recompute(next, source) {
    const out = { ...v, ...next };
    if (source === "selling") {
      const m = marginFromSelling(out.purchaseRate, out.sellingRate);
      if (m) out.margin = String(out.marginMode === "percent" ? m.percent : m.amount);
    } else {
      const r = sellingFromMargin(out.purchaseRate, out.mrp, out.marginMode, out.margin);
      if (r) {
        out.sellingRate = String(r.selling);
        if (r.capped) {
          const m = marginFromSelling(out.purchaseRate, r.selling);
          if (m) out.margin = String(out.marginMode === "percent" ? m.percent : m.amount);
        }
      }
    }
    onChange(out);
  }

  const cap = Number(v.mrp) > 0 && Number(v.sellingRate) > Number(v.mrp);
  const m = marginFromSelling(v.purchaseRate, v.sellingRate);
  const help = "mt-0.5 block text-[11px] leading-tight text-slate-400";
  const lab = "block text-xs font-medium text-slate-600";
  return (
    <>
      <label className={lab}>Total Paid
        <input type="number" min="0" step="0.01" placeholder="₹ 5000.00" value={v.totalPaid} onChange={(e) => recompute({ totalPaid: e.target.value })} className={`${inp} mt-1`} />
        {!compact && <span className={help}>Total you paid for this whole quantity — we work out the rate for you.</span>}
      </label>
      <label className={lab}>Purchase Rate per {unitName}
        <input type="number" min="0" step="0.01" placeholder="₹ 50.00" value={v.purchaseRate} onChange={(e) => recompute({ purchaseRate: e.target.value, totalPaid: "" })} className={`${inp} mt-1 ${derivedRate != null ? "bg-slate-50" : ""}`} />
        {!compact && <span className={help}>{derivedRate != null ? "Calculated: total ÷ quantity." : `Or type the rate per ${unitName} directly.`}</span>}
      </label>
      <label className={lab}>MRP per {unitName}
        <input type="number" min="0" step="0.01" placeholder="₹ 80.00" value={v.mrp} onChange={(e) => recompute({ mrp: e.target.value })} className={`${inp} mt-1`} />
        {!compact && <span className={help}>Maximum retail price printed on the {unitName}.</span>}
      </label>
      <div className={lab}>
        Margin
        <div className="mt-1 flex gap-1">
          <input type="number" min="0" step="0.01" placeholder={v.marginMode === "percent" ? "20" : "10"} value={v.margin} onChange={(e) => recompute({ margin: e.target.value })} className={inp} aria-label="Margin" />
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300 text-xs">
            {[["amount", "₹"], ["percent", "%"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => recompute({ marginMode: k, margin: m ? String(k === "percent" ? m.percent : m.amount) : v.margin })} className={`px-2.5 ${v.marginMode === k ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-white text-slate-500"}`}>{l}</button>
            ))}
          </div>
        </div>
        {!compact && <span className={help}>{m ? `₹${m.amount} / ${m.percent}% over purchase rate.` : "Your profit on each unit — as ₹ or %."}</span>}
      </div>
      <label className={lab}>Selling Price
        <input type="number" min="0" step="0.01" placeholder="₹ 60.00" value={v.sellingRate} onChange={(e) => recompute({ sellingRate: e.target.value }, "selling")} className={`${inp} mt-1 ${cap ? "border-red-400 bg-red-50" : ""}`} />
        <span className={`${help} ${cap ? "text-red-600" : ""}`}>{cap ? "Cannot be more than MRP." : compact ? "Auto-calculated." : "Automatically calculated from purchase rate and margin."}</span>
      </label>
      {tabletsPerUnit > 1 && (Number(v.purchaseRate) > 0 || Number(v.mrp) > 0) && (
        <p className="col-span-full rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
          Per tablet ({tabletsPerUnit} per {unitName}):
          {Number(v.purchaseRate) > 0 && <> cost <b>₹{(Number(v.purchaseRate) / tabletsPerUnit).toFixed(2)}</b></>}
          {Number(v.mrp) > 0 && <> · MRP <b>₹{(Number(v.mrp) / tabletsPerUnit).toFixed(2)}</b></>}
          {Number(v.sellingRate) > 0 && <> · selling <b>₹{(Number(v.sellingRate) / tabletsPerUnit).toFixed(2)}</b></>}
        </p>
      )}
    </>
  );
}
