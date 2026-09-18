"use strict";

const { prisma } = require("./prismaClient");
const { MAX_ATTEMPTS, backoffSeconds, toEnvelope } = require("./outbox");

/**
 * The Outbox processor — a small, in-process, interval-driven dispatcher.
 * Deliberately NOT a new distributed system: this is a modular monolith,
 * one always-on Node process, and a database-backed claim query is the
 * smallest thing that's actually durable and safe under concurrency (see
 * CLAUDE.md "Outbox — durable domain events" for why Kafka/RabbitMQ would
 * be overengineering at this scale).
 *
 * This has NOTHING to do with realtime — `emitToTenant`/`emitToModule`
 * fire inline, in the same request cycle, completely independent of this
 * file. This processor runs on its own schedule, asynchronously, only for
 * durable cross-module consumers.
 */

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 2000;

// eventType -> [async (payload, envelope) => void, ...] — `envelope` is the
// canonical camelCase shape from outbox.js's toEnvelope(), always
// carrying `occurredAt`, never the raw snake_case DB row.
const consumers = new Map();

/**
 * Register what happens when an event of this type is processed. Fans out
 * to every handler registered for that type, in registration order — this
 * was originally "last registration wins, no fan-out needed yet" (Phase 4),
 * upgraded here (Phase 9 — CLAUDE.md "Workflow Automation") the first time
 * a second real consumer of the same event type was actually needed: the
 * Workflow Engine's OPD_PHARMACY_BILLING workflow reacts to
 * "PrescriptionCreated" alongside the existing observability consumer
 * (outboxConsumers.js) — both must run, not one replacing the other. Each
 * handler must still be independently safe to redeliver (see the
 * idempotency note in outbox.js) since a later handler throwing marks the
 * WHOLE event for retry, re-running every handler for it again.
 */
function registerConsumer(eventType, handler) {
  const list = consumers.get(eventType) || [];
  list.push(handler);
  consumers.set(eventType, list);
}

/**
 * Claim up to BATCH_SIZE eligible PENDING rows, atomically, safe against
 * multiple processors (or multiple ticks) racing for the same rows.
 * `FOR UPDATE SKIP LOCKED` (MariaDB 11.8, confirmed available on this
 * project's DB — see CLAUDE.md's Appointment/Pharmacy sections for the
 * DB-version discovery) lets each claimant lock a disjoint set of rows
 * instead of blocking on rows another claimant already has — the same
 * row-locking discipline Pharmacy's FEFO dispense already uses
 * (`FOR UPDATE`), extended with SKIP LOCKED for the "more than one
 * claimant at once" case that FEFO never had to solve.
 */
async function claimBatch() {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe(
      `SELECT id FROM outbox_events
        WHERE status = 'PENDING' AND available_at <= NOW()
        ORDER BY id ASC
        LIMIT ?
        FOR UPDATE SKIP LOCKED`,
      BATCH_SIZE,
    );
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    await tx.outbox_events.updateMany({
      where: { id: { in: ids } },
      data: { status: "PROCESSING", claimed_at: new Date() },
    });
    return tx.outbox_events.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
  });
}

/**
 * Dispatch one claimed event to its registered consumer (a safe no-op if
 * none is registered yet — see CLAUDE.md, Phase 4 deliberately ships
 * observability-only consumers, no real business side effects). On
 * failure: increment attempts, push `available_at` forward with bounded
 * backoff, and flip to FAILED once MAX_ATTEMPTS is reached — never an
 * infinite retry loop.
 */
async function processEvent(event) {
  const handlers = consumers.get(event.event_type);
  try {
    if (handlers && handlers.length) {
      const envelope = toEnvelope(event);
      for (const handler of handlers) {
        await handler(envelope.payload, envelope);
      }
    }
    await prisma.outbox_events.update({
      where: { id: event.id },
      data: { status: "PROCESSED", processed_at: new Date() },
    });
  } catch (err) {
    const attempts = event.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    await prisma.outbox_events.update({
      where: { id: event.id },
      data: {
        status: failed ? "FAILED" : "PENDING",
        attempts,
        available_at: failed ? event.available_at : new Date(Date.now() + backoffSeconds(attempts) * 1000),
        last_error: String(err?.message || err).slice(0, 1000),
      },
    });
  }
}

/** One processing cycle: claim a bounded batch, process each in turn. Returns how many were claimed (0 = idle tick). Exported directly for tests — no need to wait a real 2s interval to exercise this. */
async function tick() {
  const batch = await claimBatch();
  for (const event of batch) {
    await processEvent(event);
  }
  return batch.length;
}

let intervalHandle = null;

/** Idempotent — safe to call more than once (guarded globally, same pattern as realtime.js's serverEvents singleton, in case this module is required from more than one place). */
function start() {
  const g = globalThis;
  if (g.__kaizenOutboxProcessorStarted) return;
  g.__kaizenOutboxProcessorStarted = true;
  intervalHandle = setInterval(() => {
    tick().catch((err) => console.error("[outbox] processor tick failed:", err));
  }, POLL_INTERVAL_MS);
  // Doesn't keep the process alive on its own during a graceful shutdown
  // wait — server.js calls stop() explicitly on SIGTERM/SIGINT anyway.
  if (intervalHandle.unref) intervalHandle.unref();
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  globalThis.__kaizenOutboxProcessorStarted = false;
}

module.exports = { registerConsumer, start, stop, tick, BATCH_SIZE };
