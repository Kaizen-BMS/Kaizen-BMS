import { tenantDb } from "./prismaClient";

/** Bill status + what is still due, for a set of bill ids (four queries, any number of bills). */
export async function billInfo(ids) {
  const list = [...new Set(ids.filter(Boolean).map(String))].map(BigInt);
  if (!list.length) return new Map();
  const [bills, pays, discs, refs] = await Promise.all([
    tenantDb.bills.findMany({ where: { id: { in: list } }, select: { id: true, status: true, total_amount: true } }),
    tenantDb.payments.groupBy({ by: ["bill_id"], where: { bill_id: { in: list } }, _sum: { amount: true } }),
    tenantDb.discounts.groupBy({ by: ["bill_id"], where: { bill_id: { in: list } }, _sum: { amount: true } }),
    tenantDb.refunds.groupBy({ by: ["bill_id"], where: { bill_id: { in: list } }, _sum: { amount: true } }),
  ]);
  const sum = (rows) => new Map(rows.map((r) => [String(r.bill_id), Number(r._sum.amount || 0)]));
  const p = sum(pays), d = sum(discs), r = sum(refs);
  return new Map(bills.map((b) => {
    const k = String(b.id);
    const due = Math.max(0, Number(b.total_amount) - (d.get(k) || 0) - ((p.get(k) || 0) - (r.get(k) || 0)));
    return [k, { id: Number(b.id), status: b.status, total: Number(b.total_amount), due: Math.round(due * 100) / 100 }];
  }));
}
