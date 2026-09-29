"use strict";

/**
 * Receiving pharmacy side of a partner prescription: the order shows in the
 * pharmacy's own screen, the pharmacist dispenses from THIS pharmacy's own
 * stock (FEFO, its own movement ledger), and the fulfilled quantity is
 * reported back to the sending hospital through the signed result webhook.
 * The pharmacy's independent inventory/queue is otherwise untouched.
 */
const { prisma } = require("./prismaClient");
const { HttpError } = require("./apiRoute");
const { priceLine } = require("./pricing");
const { perContentUnitRate } = require("./pharmacyPricing");
const { recomputeBillStatus } = require("./billing");
const { emitToModule } = require("./realtime");
const partners = require("./partners");

const toId = (v) => (typeof v === "bigint" ? v : BigInt(v));
const parse = (v, f) => {
  try {
    return JSON.parse(v);
  } catch {
    return f;
  }
};

async function defaultInstanceId(tenantId) {
  const inst = await prisma.module_instances.findFirst({ where: { tenant_id: toId(tenantId), module_name: "PHARMACY", is_default: true, status: "ACTIVE" }, select: { id: true } });
  if (!inst) throw new HttpError(409, "pharmacy_not_active");
  return inst.id;
}

async function stockOf(tenantId, instanceId, name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(quantity),0) AS q FROM pharmacy_stock
      WHERE tenant_id = ? AND module_instance_id = ? AND medicine_name = ? AND quantity > 0 AND (expiry_date IS NULL OR expiry_date >= CURDATE())`,
    toId(tenantId), instanceId, name,
  );
  return Number(rows[0]?.q || 0);
}

async function listPartnerOrders(session) {
  const all = await partners.listInbound(session);
  const rows = all.filter((o) => o.orderType === "PHARMACY_PRESCRIPTION");
  let instanceId = null;
  try { instanceId = await defaultInstanceId(session.tenantId); } catch { /* not a pharmacy */ }
  return Promise.all(
    rows.map(async (o) => ({
      id: o.id,
      from: o.from,
      status: o.status,
      connectionStatus: o.connectionStatus,
      patientName: o.payload.patientName || null,
      medicineName: o.payload.medicineName || null,
      dosage: o.payload.dosage || null,
      quantity: o.payload.quantity ?? null,
      inStock: instanceId && o.payload.medicineName ? await stockOf(session.tenantId, instanceId, o.payload.medicineName) : 0,
      receivedAt: o.receivedAt,
      result: o.result,
    })),
  );
}

/**
 * Dispense (FEFO) from this pharmacy's stock, record it, then report back.
 * Safe to retry: stock is deducted once. `requestedQty` lets the pharmacist
 * give less than the order asked for in this one pass (e.g. only some of
 * it is in stock right now) — capped at what the order actually asked for,
 * same "never more than was ordered" rule the amount used to have no way
 * to enforce on its own. `amount` is no longer taken from the caller — it's
 * computed here from the real batch(es) actually consumed, the exact same
 * rate × GST formula src/lib/pharmacySale.js's sellItems() already uses for
 * every other real stock-backed sale in this codebase, never a manually
 * typed guess.
 */
async function dispensePartnerOrder(session, id, origin, requestedQty) {
  const tenantId = toId(session.tenantId);
  const order = await prisma.peer_inbound_orders.findFirst({ where: { id: toId(id), tenant_id: tenantId } });
  if (!order || order.order_type !== "PHARMACY_PRESCRIPTION") throw new HttpError(404, "order_not_found");
  if (order.status !== "RECEIVED") throw new HttpError(409, "already_completed");
  const conn = await prisma.org_connections.findUnique({ where: { id: order.org_connection_id }, select: { status: true, requester_tenant_id: true } });
  if (!conn || conn.status !== "ACTIVE") throw new HttpError(409, "connection_not_active");

  const payload = parse(order.payload, {});
  if (!payload.medicineName || !payload.quantity) throw new HttpError(422, "order_missing_medicine");
  const instanceId = await defaultInstanceId(tenantId);
  let done = parse(order.result_payload, null);

  if (!done || done.dispensed == null) {
    const from = (await prisma.tenants.findUnique({ where: { id: conn.requester_tenant_id }, select: { name: true } }))?.name || "partner";
    const wanted = Math.min(Number(payload.quantity), requestedQty ? Number(requestedQty) : Number(payload.quantity));
    done = await prisma.$transaction(
      async (tx) => {
        const batches = await tx.$queryRawUnsafe(
          `SELECT * FROM pharmacy_stock
            WHERE tenant_id = ? AND module_instance_id = ? AND medicine_name = ? AND quantity > 0 AND (expiry_date IS NULL OR expiry_date >= CURDATE())
            ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, id ASC FOR UPDATE`,
          tenantId, instanceId, payload.medicineName,
        );
        // One medicine's batches always share the same medicine_id/GST
        // rate/pack size — looked up once, from whichever batch is actually
        // linked to the catalog (a legacy unlinked batch just prices at 0
        // tax and no pack conversion, same as everywhere else in this
        // codebase that has no rate to work from).
        const medicineId = batches.find((b) => b.medicine_id != null)?.medicine_id;
        const linkedMedicine = medicineId ? await tx.medicines.findUnique({ where: { id: medicineId }, select: { gst_rate: true, content_per_pack: true } }) : null;
        const gst = Number(linkedMedicine?.gst_rate || 0);

        // This IS a real sale — this pharmacy's own stock is genuinely
        // leaving the building for another hospital's patient — so it gets
        // a real bill, the same way an ordinary walk-in counter sale does
        // (src/app/api/pharmacy/walk-in-sale/route.js), not just a number
        // shown on the order card. There's no local patient record for
        // someone who belongs to a different tenant, so a lightweight one
        // is found-or-created exactly like walk-in-sale already does for
        // an unregistered customer, tagged so repeat orders for the same
        // named patient from the same partner share one record instead of
        // creating a new "customer" every time.
        const billPhone = `partner:${Number(conn.requester_tenant_id)}`;
        const patientName = payload.patientName || `${from} patient`;
        let billPatient = await tx.patients.findFirst({ where: { name: patientName, phone: billPhone, tenant_id: tenantId } });
        if (!billPatient) billPatient = await tx.patients.create({ data: { name: patientName, age: 0, phone: billPhone, tenants: { connect: { id: tenantId } } } });
        const bill = await tx.bills.create({ data: { bill_type: "OPD", patients: { connect: { id: billPatient.id } }, tenants: { connect: { id: tenantId } }, ...(session.userId ? { users: { connect: { id: toId(session.userId) } } } : {}) } });

        let remaining = wanted;
        const used = [];
        let amountTotal = 0;
        for (const b of batches) {
          if (remaining <= 0) break;
          const take = Math.min(Number(b.quantity), remaining);
          if (take <= 0) continue;
          await tx.pharmacy_stock.update({ where: { id: b.id }, data: { quantity: { decrement: take } } });
          const movement = await tx.pharmacy_stock_movements.create({
            data: {
              type: "DISPENSE",
              quantity_delta: -take,
              reason: `Partner order ${order.external_order_ref} from ${from}`,
              tenants: { connect: { id: tenantId } },
              pharmacy_stock: { connect: { id: b.id } },
              ...(session.userId ? { users: { connect: { id: toId(session.userId) } } } : {}),
            },
          });
          // b.selling_rate/mrp are per PACK (Strip); `take` is a count of
          // the smallest CONTENT unit (Tablet) — see pharmacyPricing.js's
          // perContentUnitRate().
          const rate = perContentUnitRate(b.selling_rate ?? b.mrp, linkedMedicine?.content_per_pack);
          let lineAmount = 0;
          let priced = null;
          if (rate != null) {
            priced = priceLine({ price: rate, tax_inclusive: false, cgst_rate: gst / 2, sgst_rate: gst / 2, igst_rate: 0 }, take);
            lineAmount = Number(priced.amount);
            amountTotal += lineAmount;
          }
          await tx.bill_items.create({
            data: {
              bill_id: bill.id,
              source: "PHARMACY",
              description: `${payload.medicineName}${b.batch_number ? ` (Batch ${b.batch_number})` : ""} × ${take} — partner order from ${from}`,
              amount: lineAmount,
              reference_type: "pharmacy_stock_movement",
              reference_id: movement.id,
              stock_id: b.id,
              medicine_id: b.medicine_id ?? null,
              batch_number: b.batch_number,
              expiry_date: b.expiry_date,
              mrp: b.mrp,
              purchase_rate: b.purchase_rate,
              ...(priced
                ? {
                    quantity: priced.quantity,
                    unit_price: priced.unit_price,
                    taxable_amount: priced.taxable_amount,
                    tax_rate: priced.tax_rate,
                    cgst_amount: priced.cgst_amount,
                    sgst_amount: priced.sgst_amount,
                    igst_amount: priced.igst_amount,
                    tax_amount: priced.tax_amount,
                  }
                : {}),
            },
          });
          used.push({ batch: b.batch_number, quantity: take });
          remaining -= take;
        }
        await recomputeBillStatus(tx, bill.id);
        const result = { dispensed: wanted - remaining, batches: used, amount: Math.round(amountTotal * 100) / 100, billId: Number(bill.id), at: new Date().toISOString() };
        await tx.peer_inbound_orders.update({ where: { id: order.id }, data: { result_payload: JSON.stringify(result) } });
        return result;
      },
      { maxWait: 10000, timeout: 30000 },
    );
    emitToModule(session.tenantId, "BILLING", "bill:created", { bill: { id: done.billId } });
  }
  if (done.dispensed <= 0) throw new HttpError(409, "out_of_stock");
  // The medicine has ALREADY been physically dispensed at this point (real
  // stock deducted, result_payload durably written above) — everything
  // from here is just reporting that fact back to the sending hospital
  // over a webhook, a separate, retryable, lower-stakes concern. A real
  // incident: this webhook call — an HTTP round trip plus its own several
  // sequential DB writes on the SENDER's side — was slow/flaky enough
  // under this project's documented remote-DB latency that its failure
  // surfaced to the pharmacist as "Could not dispense (internal_error)",
  // even though the medicine was genuinely already given. Never again
  // couple "did we tell the other hospital" to "did we give the
  // medicine" — log it and let the next call to this same endpoint retry
  // just the report (dispense itself is a no-op then, since `done` is
  // already cached in result_payload).
  try {
    await partners.completeInbound(session, id, { quantityFulfilled: done.dispensed, amount: done.amount }, origin);
  } catch (err) {
    console.error(`[partnerDispense] report-back to sending hospital failed for order ${id} (medicine was already dispensed — will retry on next call):`, err?.message || err);
  }
  return done;
}

module.exports = { listPartnerOrders, dispensePartnerOrder };
