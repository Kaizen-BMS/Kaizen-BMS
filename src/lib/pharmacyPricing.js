// Purchase rate + margin -> selling price, computed for the pharmacist.
// Margin can be typed as ₹ or %; selling price never exceeds MRP.
const r2 = (n) => Math.round(n * 100) / 100;

export function sellingFromMargin(purchase, mrp, mode, margin) {
  const p = Number(purchase);
  const m = Number(margin);
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(m) || margin === "" || margin == null) return null;
  let s = mode === "percent" ? p * (1 + m / 100) : p + m;
  const cap = Number(mrp);
  let capped = false;
  if (cap > 0 && s > cap) { s = cap; capped = true; }
  return { selling: r2(s), capped };
}

export function marginFromSelling(purchase, selling) {
  const p = Number(purchase);
  const s = Number(selling);
  if (!(p > 0) || selling === "" || selling == null || !Number.isFinite(s)) return null;
  const amount = r2(s - p);
  return { amount, percent: r2((amount / p) * 100) };
}

/**
 * A batch's selling_rate/mrp are always entered and stored per the
 * medicine's PACK unit (a Strip, a Bottle, a Tube — never per-tablet, see
 * CLAUDE.md), while pharmacy_stock.quantity (and everything sold/dispensed
 * against it) is tracked in the medicine's smallest CONTENT unit (a
 * Tablet, an ml). Every real sale — the counter (sellItems), a
 * prescription dispense (billingEvents' listener), a cross-hospital
 * partner order (partnerDispense) — needs the CONTENT-unit price, so this
 * is the one place that division happens, never duplicated per caller.
 * `contentPerPack` missing/0/1 means the pack IS the content unit (no
 * conversion needed) — the common case for anything sold as single units.
 */
export function perContentUnitRate(rate, contentPerPack) {
  if (rate == null) return null;
  const f = Number(contentPerPack) > 1 ? Number(contentPerPack) : 1;
  return Number(rate) / f;
}
