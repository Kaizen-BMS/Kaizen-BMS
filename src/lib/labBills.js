import { tenantDb } from "./prismaClient";

/**
 * Bill status + what is still due, for a set of bill ids (four queries, any
 * number of bills). `bills.total_amount` is ALREADY discount-netted —
 * `recomputeBillStatus()` (src/lib/billing.js) sets it to
 * `max(itemsTotal - discountTotal, 0)`, the "owed" figure — so `due` here
 * must only subtract net payments (paid - refunded), never discount again.
 * A bug here previously double-subtracted the discount (a real ₹50-off bill
 * showing ₹100 less due than it should), caught live while wiring up
 * Pharmacy's own discount route — same class of mistake CLAUDE.md's own
 * "Reports" section already documents for the exact same formula.
 */
export async function billInfo(ids) {
  const list = [...new Set(ids.filter(Boolean).map(String))].map(BigInt);
  if (!list.length) return new Map();
  const [bills, pays, refs] = await Promise.all([
    tenantDb.bills.findMany({ where: { id: { in: list } }, select: { id: true, status: true, total_amount: true } }),
    tenantDb.payments.groupBy({ by: ["bill_id"], where: { bill_id: { in: list } }, _sum: { amount: true } }),
    tenantDb.refunds.groupBy({ by: ["bill_id"], where: { bill_id: { in: list } }, _sum: { amount: true } }),
  ]);
  const sum = (rows) => new Map(rows.map((r) => [String(r.bill_id), Number(r._sum.amount || 0)]));
  const p = sum(pays), r = sum(refs);
  return new Map(bills.map((b) => {
    const k = String(b.id);
    const due = Math.max(0, Number(b.total_amount) - ((p.get(k) || 0) - (r.get(k) || 0)));
    return [k, { id: Number(b.id), status: b.status, total: Number(b.total_amount), due: Math.round(due * 100) / 100 }];
  }));
}
