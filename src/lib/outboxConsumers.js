"use strict";

const { registerConsumer } = require("./outboxProcessor");

/**
 * Phase 4 deliberately ships NO real business consumers — see CLAUDE.md
 * "Outbox — durable domain events". These are safe, side-effect-free
 * observability handlers only: they prove the mechanism (an event is
 * claimed, dispatched, and marked PROCESSED) without inventing a fake
 * Pharmacy/Analytics/Billing workflow that isn't actually needed yet.
 *
 * A FUTURE consumer that performs a real side effect (e.g. eventually
 * deducting stock, recording an external notification, updating an
 * analytics rollup) MUST be idempotent against redelivery — check
 * `envelope.eventId` (or a business unique key, same pattern as
 * `payments.idempotency_key`) before acting. Unique `event_id` plus
 * SKIP LOCKED claiming only guarantees a row is never claimed by two
 * processors AT ONCE — it does NOT guarantee a consumer's side effect
 * runs exactly once: a worker could perform the side effect, crash
 * before the row is marked PROCESSED, and receive the same event again
 * on the next tick. Treat delivery as at-least-once, never exactly-once,
 * for any consumer that isn't a pure no-op like these.
 *
 * `event` here is the canonical envelope from outbox.js's toEnvelope() —
 * camelCase, always carrying `occurredAt` — never the raw DB row.
 */
registerConsumer("AppointmentBooked", async (payload, event) => {
  console.log(`[outbox] AppointmentBooked ${event.eventId} appointment=${payload.appointmentId} tenant=${event.tenantId} occurredAt=${event.occurredAt}`);
});

registerConsumer("PrescriptionCreated", async (payload, event) => {
  console.log(`[outbox] PrescriptionCreated ${event.eventId} prescription=${payload.prescriptionId} tenant=${event.tenantId} occurredAt=${event.occurredAt}`);
});

registerConsumer("PaymentReceived", async (payload, event) => {
  console.log(`[outbox] PaymentReceived ${event.eventId} payment=${payload.paymentId} tenant=${event.tenantId} occurredAt=${event.occurredAt}`);
});
