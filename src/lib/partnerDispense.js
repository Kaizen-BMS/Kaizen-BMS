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

/** Dispense (FEFO) from this pharmacy's stock, record it, then report back. Safe to retry: stock is deducted once. */
async function dispensePartnerOrder(session, id, origin, amount) {
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
    done = await prisma.$transaction(
      async (tx) => {
        const batches = await tx.$queryRawUnsafe(
          `SELECT * FROM pharmacy_stock
            WHERE tenant_id = ? AND module_instance_id = ? AND medicine_name = ? AND quantity > 0 AND (expiry_date IS NULL OR expiry_date >= CURDATE())
            ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, id ASC FOR UPDATE`,
          tenantId, instanceId, payload.medicineName,
        );
        let remaining = Number(payload.quantity);
        const used = [];
        for (const b of batches) {
          if (remaining <= 0) break;
          const take = Math.min(Number(b.quantity), remaining);
          if (take <= 0) continue;
          await tx.pharmacy_stock.update({ where: { id: b.id }, data: { quantity: { decrement: take } } });
          await tx.pharmacy_stock_movements.create({
            data: { tenant_id: tenantId, stock_id: b.id, type: "DISPENSE", quantity_delta: -take, reason: `Partner order ${order.external_order_ref} from ${from}`, performed_by: toId(session.userId) },
          });
          used.push({ batch: b.batch_number, quantity: take });
          remaining -= take;
        }
        const result = { dispensed: Number(payload.quantity) - remaining, batches: used, at: new Date().toISOString() };
        await tx.peer_inbound_orders.update({ where: { id: order.id }, data: { result_payload: JSON.stringify(result) } });
        return result;
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }
  if (done.dispensed <= 0) throw new HttpError(409, "out_of_stock");
  await partners.completeInbound(session, id, { quantityFulfilled: done.dispensed, amount }, origin);
  return done;
}

module.exports = { listPartnerOrders, dispensePartnerOrder };
