"use strict";

/**
 * The outbound tracking record — "this internal order was sent to this
 * provider, here's what happened." A real state machine (unlike internal
 * orders' lighter schedule/start/cancel shape) because this one genuinely
 * tracks network-call outcomes: PENDING -> SENT -> ACKNOWLEDGED ->
 * PROCESSING -> COMPLETED, or -> FAILED / CANCELLED. See the External
 * Integration Blueprint Part 8 for the full failure-state reasoning.
 */
const EXTERNAL_ORDER_STATUSES = ["PENDING", "SENT", "ACKNOWLEDGED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];
const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

function toId(v) {
  return typeof v === "bigint" ? v : BigInt(v);
}

/** Idempotent by (tenant, order_type, internal_reference) — a duplicate request finds the existing row instead of creating a second one, same "unique constraint over pre-check" discipline as every other idempotent-create in this codebase. */
async function findOrCreateExternalOrder(db, { tenantId, providerId, externalConnectionId, orderType, internalReferenceType, internalReferenceId, requestPayload, createdBy }) {
  try {
    return await db.external_orders.create({
      data: {
        tenant_id: toId(tenantId),
        provider_id: toId(providerId),
        external_connection_id: toId(externalConnectionId),
        order_type: orderType,
        internal_reference_type: internalReferenceType,
        internal_reference_id: toId(internalReferenceId),
        status: "PENDING",
        request_payload: JSON.stringify(requestPayload),
        created_by: createdBy != null ? toId(createdBy) : null,
      },
    });
  } catch (err) {
    if (err && err.code === "P2002") {
      return db.external_orders.findFirst({
        where: { tenant_id: toId(tenantId), order_type: orderType, internal_reference_type: internalReferenceType, internal_reference_id: toId(internalReferenceId) },
      });
    }
    throw err;
  }
}

async function markSent(db, id, { externalOrderRef, responsePayload }) {
  return db.external_orders.update({
    where: { id: toId(id) },
    data: { status: "SENT", external_order_ref: externalOrderRef || null, response_payload: responsePayload ? JSON.stringify(responsePayload) : undefined, sent_at: new Date(), attempts: { increment: 1 } },
  });
}

async function markFailed(db, id, errorMessage) {
  return db.external_orders.update({
    where: { id: toId(id) },
    data: { status: "FAILED", last_error: String(errorMessage).slice(0, 500), attempts: { increment: 1 } },
  });
}

async function updateStatusByExternalRef(db, { tenantId, providerId, externalOrderRef, status, responsePayload }) {
  const order = await db.external_orders.findFirst({ where: { tenant_id: toId(tenantId), provider_id: toId(providerId), external_order_ref: externalOrderRef } });
  if (!order) return null;
  if (TERMINAL_STATUSES.has(order.status)) return order; // terminal — a late/duplicate status update is a safe no-op
  const data = { status, response_payload: responsePayload ? JSON.stringify(responsePayload) : undefined };
  if (status === "ACKNOWLEDGED") data.acknowledged_at = new Date();
  if (status === "COMPLETED") data.completed_at = new Date();
  if (status === "CANCELLED") data.cancelled_at = new Date();
  return db.external_orders.update({ where: { id: order.id }, data });
}

function serializeExternalOrder(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    providerId: Number(row.provider_id),
    externalConnectionId: Number(row.external_connection_id),
    orderType: row.order_type,
    internalReferenceType: row.internal_reference_type,
    internalReferenceId: Number(row.internal_reference_id),
    externalOrderRef: row.external_order_ref,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    sentAt: row.sent_at,
    acknowledgedAt: row.acknowledged_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  EXTERNAL_ORDER_STATUSES,
  TERMINAL_STATUSES,
  findOrCreateExternalOrder,
  markSent,
  markFailed,
  updateStatusByExternalRef,
  serializeExternalOrder,
};
