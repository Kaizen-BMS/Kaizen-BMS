"use strict";

/**
 * Shared bill math — a bill's status and total_amount are always DERIVED
 * from its items/discounts/payments/refunds, never hand-set by a route.
 * Every route that changes one of those child rows calls this afterward
 * (inside the same transaction when there is one) to keep bills in sync.
 *
 *   owed    = sum(bill_items.amount) - sum(discounts.amount), floored at 0
 *   netPaid = sum(payments.amount) - sum(refunds.amount)
 *   status  = REFUNDED  (something was refunded and nothing net remains paid)
 *           | OPEN            (nothing paid yet)
 *           | PARTIALLY_PAID  (paid something, less than owed)
 *           | PAID            (paid >= owed)
 */
async function recomputeBillStatus(db, billId) {
  // One round trip instead of four — inside an interactive transaction,
  // Prisma serializes queries on a single connection regardless of
  // Promise.all, so four separate findMany calls were four sequential
  // round trips anyway. Fewer round trips = less exposure to this remote
  // DB's transaction-timeout risk (see CLAUDE.md "Billing module").
  const [row] = await db.$queryRawUnsafe(
    `SELECT
       (SELECT COALESCE(SUM(amount), 0) FROM bill_items WHERE bill_id = ?) AS items_total,
       (SELECT COALESCE(SUM(amount), 0) FROM discounts WHERE bill_id = ?) AS discount_total,
       (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE bill_id = ?) AS paid_total,
       (SELECT COALESCE(SUM(amount), 0) FROM refunds WHERE bill_id = ?) AS refund_total`,
    billId,
    billId,
    billId,
    billId,
  );

  const itemsTotal = Number(row.items_total);
  const discountTotal = Number(row.discount_total);
  const owed = Math.max(itemsTotal - discountTotal, 0);
  const paidTotal = Number(row.paid_total);
  const refundTotal = Number(row.refund_total);
  const netPaid = paidTotal - refundTotal;

  let status;
  if (refundTotal > 0 && netPaid <= 0) status = "REFUNDED";
  else if (netPaid <= 0) status = "OPEN";
  else if (netPaid < owed) status = "PARTIALLY_PAID";
  else status = "PAID";

  await db.bills.update({ where: { id: billId }, data: { total_amount: owed, status } });
  return { owed, netPaid, status, itemsTotal, discountTotal, paidTotal, refundTotal };
}

module.exports = { recomputeBillStatus };
