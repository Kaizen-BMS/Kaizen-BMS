"use strict";

/**
 * The Inbox — inbound mirror of src/lib/outbox.js. Recording the
 * provider's own delivery id is the real idempotency guarantee: if a
 * provider redelivers the same webhook 10 times, only the first insert
 * ever succeeds (a real DB unique constraint, `uq_webhook_events_provider_event`
 * — not just an app-level pre-check, same discipline as every other
 * idempotency mechanism in this codebase). The caller writes this row
 * AND performs the business transaction together, inside the SAME
 * `tenantDb.$transaction()` — mirrors Outbox's own "durable event +
 * business fact, same transaction" rule, just inbound.
 */
function toId(v) {
  return typeof v === "bigint" ? v : BigInt(v);
}

/** Returns { duplicate: true } if this exact provider_event_id was already recorded — caller must skip the business transaction entirely in that case. */
async function recordWebhookEvent(tx, { tenantId, providerId, providerEventId, eventType, payload, signatureValid }) {
  try {
    const row = await tx.webhook_events.create({
      data: {
        tenant_id: toId(tenantId),
        provider_id: toId(providerId),
        provider_event_id: String(providerEventId),
        event_type: eventType,
        payload: JSON.stringify(payload),
        signature_valid: !!signatureValid,
        status: "PROCESSING",
      },
    });
    return { duplicate: false, row };
  } catch (err) {
    if (err && err.code === "P2002") return { duplicate: true, row: null };
    throw err;
  }
}

async function markProcessed(tx, id) {
  return tx.webhook_events.update({ where: { id: toId(id) }, data: { status: "PROCESSED", processed_at: new Date() } });
}

async function markFailed(tx, id, errorMessage) {
  return tx.webhook_events.update({ where: { id: toId(id) }, data: { status: "FAILED", last_error: String(errorMessage).slice(0, 500), attempts: { increment: 1 } } });
}

module.exports = { recordWebhookEvent, markProcessed, markFailed };
