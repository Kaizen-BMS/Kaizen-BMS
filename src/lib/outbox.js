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
 */
async function writeOutboxEvent(tx, { tenantId, eventType, aggregateType, aggregateId, payload, payloadVersion = 1 }) {
  return tx.outbox_events.create({
    data: {
      event_id: crypto.randomUUID(),
      tenant_id: BigInt(tenantId),
      event_type: eventType,
      aggregate_type: aggregateType,
      aggregate_id: BigInt(aggregateId),
      payload: JSON.stringify(payload),
      payload_version: payloadVersion,
    },
  });
}

module.exports = { EVENT_TYPES, MAX_ATTEMPTS, backoffSeconds, writeOutboxEvent };
