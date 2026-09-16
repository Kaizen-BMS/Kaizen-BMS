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
 * `event.event_id` (or a business unique key, same pattern as
 * `payments.idempotency_key`) before acting, since the processor
 * guarantees "delivered at least once", never "delivered exactly once".
 */
registerConsumer("AppointmentBooked", async (payload, event) => {
  console.log(`[outbox] AppointmentBooked ${event.event_id} appointment=${payload.appointmentId} tenant=${event.tenant_id}`);
});

registerConsumer("PrescriptionCreated", async (payload, event) => {
  console.log(`[outbox] PrescriptionCreated ${event.event_id} prescription=${payload.prescriptionId} tenant=${event.tenant_id}`);
});

registerConsumer("PaymentReceived", async (payload, event) => {
  console.log(`[outbox] PaymentReceived ${event.event_id} payment=${payload.paymentId} tenant=${event.tenant_id}`);
});
