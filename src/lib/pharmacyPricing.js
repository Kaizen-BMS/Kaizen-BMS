// Purchase rate + margin -> selling price, computed for the pharmacist.
// Margin can be typed as ₹ or %; selling price never exceeds MRP.
const r2 = (n) => Math.round(n * 100) / 100;

/** "10 tablets" / "10's" / "1x15" -> how many single tablets/capsules a strip holds (null if unknown). */
export function tabletsFromPack(packSize) {
  const m = String(packSize || "").match(/(\d+)\s*(?:x\s*(\d+))?/i);
  if (!m) return null;
  const n = m[2] ? Number(m[2]) : Number(m[1]);
  return n > 1 ? n : null;
}

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
