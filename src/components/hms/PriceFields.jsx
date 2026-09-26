"use client";

import { useEffect } from "react";
import { sellingFromMargin, marginFromSelling } from "@/lib/pharmacyPricing";

const inp = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";

export const EMPTY_PRICE = { totalPaid: "", purchaseRate: "", mrp: "", marginMode: "amount", margin: "", sellingRate: "" };

// Purchase Rate -> MRP -> Margin (₹ or %) -> Selling Price. Selling price is
// worked out for you and can never go above MRP; type a selling price and the
// margin is worked out instead.
export default function PriceFields({ value, onChange, quantity, unitName = "unit", contentUnit, contentPerPack, levels, stockPer = 1, stockUnitName }) {
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
  const lab = "block text-[11px] font-medium text-slate-600";
  const cell = `${inp} mt-0.5 !py-1`;
  const cost = Number(v.purchaseRate) || 0;
  const mrp = Number(v.mrp) || 0;
  const sell = Number(v.sellingRate) || 0;
  // Each row is one level of the pack (Box -> Strip -> Tablet), priced by dividing what was entered.
  const rows = levels && levels.length
    ? levels
    : [{ label: unitName, per: 1 }, ...(contentUnit && contentPerPack > 1 ? [{ label: contentUnit.toLowerCase(), per: contentPerPack }] : [])];
  const money = (n) => (n > 0 ? `₹${(n).toFixed(2)}` : "—");
  const totalCost = total > 0 ? total : cost * (qty || 0);
  const totalSell = sell * (qty || 0);
  const profit = totalSell - totalCost;
  const showCalc = cost > 0 || mrp > 0 || sell > 0;
  return (
    <div className="grid gap-3 sm:col-span-2 lg:col-span-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="grid grid-cols-2 content-start gap-x-2 gap-y-1.5 sm:grid-cols-3">
        <label className={lab}>Total Paid (₹)
          <input type="number" min="0" step="0.01" placeholder="5000" value={v.totalPaid} onChange={(e) => recompute({ totalPaid: e.target.value })} className={cell} />
        </label>
        <label className={lab}>Cost per {unitName}
          <input type="number" min="0" step="0.01" placeholder="50" value={v.purchaseRate} onChange={(e) => recompute({ purchaseRate: e.target.value, totalPaid: "" })} className={`${cell} ${derivedRate != null ? "bg-slate-50" : ""}`} />
        </label>
        <label className={lab}>MRP per {unitName}
          <input type="number" min="0" step="0.01" placeholder="80" value={v.mrp} onChange={(e) => recompute({ mrp: e.target.value })} className={cell} />
        </label>
        <div className={lab}>
          Margin
          <div className="mt-0.5 flex gap-1">
            <input type="number" min="0" step="0.01" placeholder={v.marginMode === "percent" ? "20" : "10"} value={v.margin} onChange={(e) => recompute({ margin: e.target.value })} className={`${inp} !py-1`} aria-label="Margin" />
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300 text-xs">
              {[["amount", "₹"], ["percent", "%"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => recompute({ marginMode: k, margin: m ? String(k === "percent" ? m.percent : m.amount) : v.margin })} className={`px-2 ${v.marginMode === k ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-white text-slate-500"}`}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <label className={lab}>Selling per {unitName}
          <input type="number" min="0" step="0.01" placeholder="60" value={v.sellingRate} onChange={(e) => recompute({ sellingRate: e.target.value }, "selling")} className={`${cell} ${cap ? "border-red-400 bg-red-50" : ""}`} />
          {cap && <span className="text-[10px] text-red-600">Cannot be more than MRP.</span>}
        </label>
        <p className="col-span-full text-[10px] text-slate-400">Enter the total you paid, or the rate directly — the rest is worked out on the right.</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 text-xs">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Calculation</p>
        {showCalc ? (
          <>
            <table className="w-full text-right tabular-nums">
              <thead className="text-[10px] text-slate-400">
                <tr><th className="text-left font-medium">Per</th><th className="font-medium">Cost</th><th className="font-medium">MRP</th><th className="font-medium">Sell</th><th className="font-medium">Profit</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-slate-200">
                    <td className="py-0.5 text-left font-medium capitalize text-slate-600">{r.label}</td>
                    <td>{money(cost / r.per)}</td>
                    <td>{money(mrp / r.per)}</td>
                    <td className="font-semibold text-slate-700">{money(sell / r.per)}</td>
                    <td className={sell - cost >= 0 ? "text-emerald-700" : "text-red-600"}>{cost > 0 && sell > 0 ? money(Math.abs(sell - cost) / r.per) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {qty > 0 && (
              <div className="mt-1.5 space-y-0.5 border-t border-slate-200 pt-1.5 text-slate-600">
                {stockPer > 1 && <p>Adds <b>{qty * stockPer}</b> {stockUnitName || "units"} to stock</p>}
                {totalCost > 0 && <p>Total cost <b>₹{totalCost.toFixed(2)}</b></p>}
                {totalSell > 0 && <p>Selling value <b>₹{totalSell.toFixed(2)}</b></p>}
                {totalCost > 0 && totalSell > 0 && <p className={profit >= 0 ? "text-emerald-700" : "text-red-600"}>Expected profit <b>₹{profit.toFixed(2)}</b> ({totalCost > 0 ? ((profit / totalCost) * 100).toFixed(1) : 0}%)</p>}
              </div>
            )}
          </>
        ) : (
          <p className="text-slate-400">Fill in the cost and MRP — per {unitName}{rows.length > 1 ? ", per " + rows.slice(1).map((r) => r.label).join(" and per ") : ""} and profit show up here.</p>
        )}
      </div>
    </div>
  );
}
