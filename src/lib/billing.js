"use strict";

const { findApplicableTariff, priceLine } = require("./pricing");

// billing.js is required from server.js's own top-level chain (via billingEvents.js), before
// app.prepare() has initialized Next's runtime — requiring apiRoute.js here (which pulls in
// next/server) crashes the whole server at boot, the exact documented gotcha in CLAUDE.md's
// Workflow Automation section. A small local class, duck-typed the same way every route in this
// codebase already treats a thrown error (`typeof err.status === "number"`), avoids that import.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * One priced bill_item, from either a catalog service (its current tariff prices it — never a
 * client-supplied amount) or a manual line (a medicine/test with no price catalog entry, priced by
 * hand — see CLAUDE.md "Pharmacy/lab item amounts start at 0"). The one place this shape is built —
 * used by both the walk-in bill's own creation step and adding a line to an already-open bill later
 * (CLAUDE.md "Running / Combined Bill"), so the two can never drift apart.
 */
async function addBillLine(tx, { billId, item, defaultSource, defaultCategory = "SELF_PAY" }) {
  if (item.serviceId) {
    const service = await tx.services.findUnique({ where: { id: BigInt(item.serviceId) } });
    if (!service || !service.active) throw new HttpError(400, service ? "service_inactive" : "service_not_found");
    const tariff = await findApplicableTariff(tx, service.id, item.patientCategory || defaultCategory);
    if (!tariff) throw new HttpError(400, "no_active_tariff");
    const line = priceLine(tariff, item.quantity ?? 1);
    return tx.bill_items.create({
      data: {
        bill_id: billId, source: "SERVICE", description: service.name, amount: line.amount,
        reference_type: "service", reference_id: service.id, service_id: service.id, tariff_id: tariff.id,
        quantity: line.quantity, unit_price: line.unit_price, taxable_amount: line.taxable_amount,
        tax_rate: line.tax_rate, cgst_amount: line.cgst_amount, sgst_amount: line.sgst_amount,
        igst_amount: line.igst_amount, tax_amount: line.tax_amount,
      },
    });
  }
  if (!item.description || item.unitPrice == null) throw new HttpError(400, "item_incomplete");
  const quantity = item.quantity ?? 1;
  return tx.bill_items.create({
    data: {
      bill_id: billId, source: defaultSource, description: item.description,
      quantity, unit_price: item.unitPrice, amount: Math.round(quantity * item.unitPrice * 100) / 100,
    },
  });
}

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

module.exports = { recomputeBillStatus, addBillLine };
