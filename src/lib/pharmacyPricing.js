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
