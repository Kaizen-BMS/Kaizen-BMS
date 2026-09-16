"use strict";

const crypto = require("crypto");

/**
 * Outbox — durable domain events, Phase 4 of the platform rebuild (see
 * CLAUDE.md "Outbox — durable domain events"). This is NOT the realtime
 * mechanism: `emitToTenant`/`emitToModule` (src/lib/realtime.js) stay
 * completely untouched, zero-delay, same request cycle, exactly as
 * before. This file is a SEPARATE, additive concern — a durable record
 * that a business fact happened, written atomically alongside it, so a
 * future cross-module consumer (not built yet) can react to it reliably
 * even if nobody was listening on a socket at the moment it occurred.
 *
 * `writeOutboxEvent()` MUST be called with the same `tx` the business
 * write itself used — passing the ambient `tenantDb` instead of the
 * transaction handle would let the two writes commit independently,
 * defeating the entire point (see the three call sites: bookAppointment(),
 * the prescription-create route, the payment-create route — all pass
 * their own `tx`).
 */

// Bounded — after this many failed attempts an event stops retrying and
// sits as FAILED for a human/ops to look at (see outboxProcessor.js).
// Not configurable per-event in this phase; deliberately one constant,
// not a per-event-type policy table that doesn't have a real use yet.
const MAX_ATTEMPTS = 5;

/** Exponential backoff in seconds, capped at 1 hour, for the Nth failed attempt. */
function backoffSeconds(attempts) {
  return Math.min(60 * 2 ** attempts, 3600);
}

/**
 * The current, deliberately small event catalog (Phase 4 — do not expand
 * without a real reason; see CLAUDE.md). Each entry is the CONTRACT for
 * that event_type's payload — ID-first, no PHI, no secrets, no full
 * records. Enforced only by convention/review at the call site today (not
 * a runtime schema validator — the three call sites are few enough that a
 * dedicated validation layer would be premature for this phase).
 *
 *   AppointmentBooked   { appointmentId, patientId, doctorUserId, slotTime, bookedBy }
 *   PrescriptionCreated { prescriptionId, patientId, visitId, consultationId, createdBy, itemCount }
 *   PaymentReceived     { paymentId, billId, amount, mode, recordedBy }
 */
const EVENT_TYPES = ["AppointmentBooked", "PrescriptionCreated", "PaymentReceived"];

/**
 * Write one durable event row inside an existing transaction. Returns the
 * created row (rarely needed by the caller — the point is that it
 * committed, not its return value).
 *
 * `occurredAt` — when the DOMAIN event itself happened, distinct from
 * `created_at` (when this outbox row was persisted; see the migration
 * 026 comment and CLAUDE.md's "created_at vs occurred_at" note). Every
 * current call site creates its event synchronously inside the same
 * transaction as the business write, so leaving it unset (the normal
 * case — no caller needs to pass it today) defaults to "now," which is
 * correct for all three of them. The parameter exists for the real
 * future case this table is meant to support: a delayed, imported, or
 * replayed event whose true occurrence predates when the row is written.
 */
async function writeOutboxEvent(tx, { tenantId, eventType, aggregateType, aggregateId, payload, payloadVersion = 1, occurredAt }) {
  const occurred = occurredAt == null ? new Date() : new Date(occurredAt);
  if (Number.isNaN(occurred.getTime())) {
    throw new Error(`writeOutboxEvent: invalid occurredAt "${occurredAt}"`);
  }
  return tx.outbox_events.create({
    data: {
      event_id: crypto.randomUUID(),
      tenant_id: BigInt(tenantId),
      event_type: eventType,
      aggregate_type: aggregateType,
      aggregate_id: BigInt(aggregateId),
      occurred_at: occurred,
      payload: JSON.stringify(payload),
      payload_version: payloadVersion,
    },
  });
}

/**
 * DB row (snake_case) -> the canonical event envelope every consumer and
 * observability surface should see: `{eventId, tenantId, eventType,
 * aggregateType, aggregateId, payloadVersion, occurredAt, payload}` —
 * the exact contract this project settled on. `occurredAt` is always a
 * plain ISO-8601 string here, the one canonical timestamp representation
 * at this boundary — never a bare Date object a consumer would have to
 * know how to serialize itself.
 */
function toEnvelope(row) {
  return {
    eventId: row.event_id,
    tenantId: Number(row.tenant_id),
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: Number(row.aggregate_id),
    payloadVersion: row.payload_version,
    occurredAt: row.occurred_at.toISOString(),
    payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
  };
}

module.exports = { EVENT_TYPES, MAX_ATTEMPTS, backoffSeconds, writeOutboxEvent, toEnvelope };
