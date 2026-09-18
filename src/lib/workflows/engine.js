"use strict";

const { HttpError } = require("../apiRoute");
const { emitToTenant } = require("../realtime");
const { getDefinition } = require("./definitions");

/**
 * Generic Workflow Engine — Phase 9 (CLAUDE.md "Workflow Automation").
 * Deliberately small: this is NOT a BPMN engine and does not perform any
 * business action itself — dispensing/billing/discharge stay exactly
 * where they already live (Pharmacy's FEFO dispense route, Billing's
 * checkout/event listeners, IPD's discharge route). What this file
 * provides is generic bookkeeping every workflow definition needs:
 * starting an instance idempotently, locking it for a concurrency-safe
 * update, and recording step outcomes.
 *
 * Each workflow-specific module (opdPharmacyBilling.js / labResultBilling.js
 * / ipdAdmissionDischarge.js) re-derives the CURRENT real state of the
 * world from the actual domain tables every time its `advance()` runs
 * (never from a cached flag) and calls the helpers here to record what it
 * found — this makes `advance()` naturally idempotent and safe to call
 * redundantly from multiple triggers (an Outbox redelivery, a realtime
 * event, a manual retry all converge on the same truth).
 */

// Bounded — matches the Outbox's own MAX_ATTEMPTS convention (CLAUDE.md
// "Outbox — durable domain events"). A step stuck at this many failed
// attempts requires a human to look at it; retryStep() refuses beyond it.
const MAX_STEP_ATTEMPTS = 5;

const TERMINAL_INSTANCE_STATUSES = new Set(["COMPLETED", "CANCELLED", "FAILED"]);

function toId(v) {
  return typeof v === "bigint" ? v : BigInt(v);
}

function toDetailJson(detail) {
  return detail === undefined ? undefined : detail === null ? null : JSON.stringify(detail);
}

/**
 * Idempotent workflow start: creates the instance + its full step
 * checklist (every step PENDING) in one transaction. A duplicate trigger
 * (a redelivered Outbox event, a realtime event firing twice, a retry
 * racing a fresh event) hits the real DB unique constraint
 * (tenant_id, definition_code, reference_type, reference_id) and is
 * treated as "already started" — never a duplicate instance. Same
 * "unique constraint over pre-check" discipline as
 * requestConnection()/changeTariff() elsewhere in this codebase.
 */
async function startOrGetInstance(db, { tenantId, definitionCode, referenceType, referenceId, createdBy }) {
  const definition = getDefinition(definitionCode);
  if (!definition) throw new Error(`unknown_workflow_definition:${definitionCode}`);

  try {
    return await db.$transaction(async (tx) => {
      const instance = await tx.workflow_instances.create({
        data: {
          tenant_id: toId(tenantId),
          definition_code: definitionCode,
          definition_version: definition.version,
          reference_type: referenceType,
          reference_id: toId(referenceId),
          status: "RUNNING",
          current_step: definition.steps[0].code,
          created_by: createdBy != null ? toId(createdBy) : null,
        },
      });
      await tx.workflow_instance_steps.createMany({
        data: definition.steps.map((s, i) => ({
          tenant_id: toId(tenantId),
          workflow_instance_id: instance.id,
          step_code: s.code,
          step_order: i,
          status: "PENDING",
        })),
      });
      return { instance, created: true };
    });
  } catch (err) {
    if (err && err.code === "P2002") {
      const existing = await db.workflow_instances.findFirst({
        where: {
          tenant_id: toId(tenantId),
          definition_code: definitionCode,
          reference_type: referenceType,
          reference_id: toId(referenceId),
        },
      });
      if (existing) return { instance: existing, created: false };
    }
    throw err;
  }
}

/**
 * The shared concurrency-safety primitive every workflow-specific
 * `advance()` uses before touching state — locks the instance row with
 * `SELECT ... FOR UPDATE` inside a transaction (same technique Pharmacy's
 * FEFO dispense and the Outbox processor's claim query already use), so
 * two workers (two events firing near-simultaneously, or an event racing
 * a manual retry) can never both advance the same workflow step at once.
 * Returns whatever `fn` returns, or `null` if the instance doesn't exist
 * for this tenant.
 */
async function withLockedInstance(db, tenantId, instanceId, fn) {
  return db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRawUnsafe(
      `SELECT * FROM workflow_instances WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      toId(instanceId),
      toId(tenantId),
    );
    if (!locked) return null;
    const steps = await tx.workflow_instance_steps.findMany({
      where: { workflow_instance_id: toId(instanceId) },
      orderBy: { step_order: "asc" },
    });
    return fn(tx, locked, steps);
  });
}

/** Mark a step COMPLETED and move the instance's current_step to whatever is next in the definition (or leaves it if this was the last step — completeInstance() is what actually finishes the workflow). */
async function completeStep(tx, instance, stepCode, detail) {
  await tx.workflow_instance_steps.updateMany({
    where: { workflow_instance_id: instance.id, step_code: stepCode },
    data: { status: "COMPLETED", completed_at: new Date(), detail: toDetailJson(detail), last_error: null },
  });
}

/** A step that legitimately does not apply this time (e.g. no nursing note during a short IPD stay) — a real, valid outcome, never treated as an error. */
async function skipStep(tx, instance, stepCode, reason) {
  await tx.workflow_instance_steps.updateMany({
    where: { workflow_instance_id: instance.id, step_code: stepCode },
    data: { status: "SKIPPED", completed_at: new Date(), last_error: reason || null },
  });
}

/** The workflow is currently sitting on this step, in progress or blocked — instance stays RUNNING (a step waiting on a human action, e.g. dispensing, is normal, not an error). */
async function setCurrentStep(tx, instance, stepCode) {
  if (instance.current_step !== stepCode || instance.status === "PENDING") {
    await tx.workflow_instance_steps.updateMany({
      where: { workflow_instance_id: instance.id, step_code: stepCode, status: "PENDING" },
      data: { status: "RUNNING", started_at: new Date() },
    });
  }
  await tx.workflow_instances.updateMany({
    where: { id: instance.id },
    data: { current_step: stepCode, status: "RUNNING" },
  });
}

/** A transient, recoverable block (e.g. no active pharmacy connection yet) — WAITING, not FAILED. Every future advance() call keeps re-checking automatically; no manual retry is required once the real-world condition clears. */
async function waitInstance(tx, instance, stepCode, reason) {
  await tx.workflow_instance_steps.updateMany({
    where: { workflow_instance_id: instance.id, step_code: stepCode },
    data: { status: "RUNNING", started_at: new Date(), last_error: reason || null },
  });
  await tx.workflow_instances.updateMany({
    where: { id: instance.id },
    data: { status: "WAITING", current_step: stepCode, last_error: reason || null },
  });
}

/** A hard, non-transient business failure (revoked connection, invalid contract payload) — FAILED is terminal; only an explicit retryStep() re-opens it, so advance() never silently keeps hammering a permanent error. */
async function failInstance(tx, instance, stepCode, reason) {
  await tx.workflow_instance_steps.updateMany({
    where: { workflow_instance_id: instance.id, step_code: stepCode },
    data: { status: "FAILED", last_error: reason || null, attempts: { increment: 1 } },
  });
  await tx.workflow_instances.updateMany({
    where: { id: instance.id },
    data: { status: "FAILED", current_step: stepCode, last_error: reason || null, failed_at: new Date() },
  });
}

/** Every step is done — the workflow's own COMPLETED checklist entry completes alongside the instance. */
async function completeInstance(tx, instance) {
  await completeStep(tx, instance, "COMPLETED");
  await tx.workflow_instances.updateMany({
    where: { id: instance.id },
    data: { status: "COMPLETED", current_step: "COMPLETED", completed_at: new Date(), last_error: null },
  });
}

async function cancelInstance(db, tenantId, instanceId, actorUserId, reason) {
  return withLockedInstance(db, tenantId, instanceId, async (tx, instance) => {
    if (!instance) throw new HttpError(404, "workflow_not_found");
    if (TERMINAL_INSTANCE_STATUSES.has(instance.status)) throw new HttpError(409, "workflow_already_finished");
    await tx.workflow_instances.updateMany({
      where: { id: instance.id },
      data: { status: "CANCELLED", last_error: reason || null },
    });
    return Number(instance.id);
  });
}

/**
 * Reset a FAILED (or WAITING) step back to PENDING so the workflow's own
 * `advance()` re-derives fresh truth and tries again — bounded by
 * MAX_STEP_ATTEMPTS, never an infinite retry loop. Does NOT itself re-run
 * the workflow-specific logic — the caller (the retry API route) must
 * call `runAdvancer()` afterward with the instance's own definitionCode +
 * referenceId, which is why this returns those.
 */
async function retryStep(db, tenantId, instanceId) {
  return withLockedInstance(db, tenantId, instanceId, async (tx, instance, steps) => {
    if (!instance) throw new HttpError(404, "workflow_not_found");
    if (TERMINAL_INSTANCE_STATUSES.has(instance.status) && instance.status !== "FAILED") {
      throw new HttpError(409, "workflow_already_finished");
    }
    const step = steps.find((s) => s.step_code === instance.current_step);
    if (!step) throw new HttpError(409, "no_current_step");
    if (step.status !== "FAILED" && instance.status !== "WAITING") {
      throw new HttpError(409, "step_not_retryable");
    }
    if (step.attempts >= MAX_STEP_ATTEMPTS) throw new HttpError(409, "max_attempts_reached");

    await tx.workflow_instance_steps.updateMany({
      where: { workflow_instance_id: instance.id, step_code: step.step_code },
      data: { status: "PENDING", last_error: null, attempts: { increment: instance.status === "WAITING" ? 0 : 1 } },
    });
    await tx.workflow_instances.updateMany({
      where: { id: instance.id },
      data: { status: "RUNNING", last_error: null, failed_at: null },
    });
    return {
      definitionCode: instance.definition_code,
      referenceType: instance.reference_type,
      referenceId: Number(instance.reference_id),
    };
  });
}

// definitionCode -> async (tenantId, referenceId) => void — registered by
// each workflow-specific module at load time (side-effect require, same
// pattern as outboxProcessor.js's registerConsumer). Lets the generic
// retry API route re-run the right workflow's advance() without engine.js
// importing any domain module (which would create a require cycle, since
// every domain module already imports engine.js).
const advancers = new Map();

function registerAdvancer(definitionCode, fn) {
  advancers.set(definitionCode, fn);
}

async function runAdvancer(definitionCode, tenantId, referenceId) {
  const fn = advancers.get(definitionCode);
  if (!fn) return;
  await fn(tenantId, referenceId);
}

function safeParseDetail(v) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function serializeStep(row) {
  return {
    id: Number(row.id),
    stepCode: row.step_code,
    order: row.step_order,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    detail: safeParseDetail(row.detail),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function serializeInstance(row, steps) {
  const definition = getDefinition(row.definition_code);
  return {
    id: Number(row.id),
    definitionCode: row.definition_code,
    definitionName: definition?.name || row.definition_code,
    definitionDescription: definition?.description || null,
    version: row.definition_version,
    referenceType: row.reference_type,
    referenceId: Number(row.reference_id),
    status: row.status,
    currentStep: row.current_step,
    lastError: row.last_error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps: steps ? steps.map(serializeStep) : undefined,
  };
}

async function listInstances(db, tenantId, { status, definitionCode, limit = 200 } = {}) {
  const where = { tenant_id: toId(tenantId) };
  if (status) where.status = status;
  if (definitionCode) where.definition_code = definitionCode;
  const rows = await db.workflow_instances.findMany({ where, orderBy: { updated_at: "desc" }, take: limit });
  return rows.map((r) => serializeInstance(r));
}

async function getInstance(db, tenantId, instanceId) {
  const row = await db.workflow_instances.findFirst({ where: { id: toId(instanceId), tenant_id: toId(tenantId) } });
  if (!row) return null;
  const steps = await db.workflow_instance_steps.findMany({
    where: { workflow_instance_id: row.id },
    orderBy: { step_order: "asc" },
  });
  return serializeInstance(row, steps);
}

/** Realtime status update (CLAUDE.md Phase 9 "Realtime workflow updates") — the full tenant room every logged-in session already joins (server.js), same broad-audience pattern as bed:updated/bill:updated/visit:updated. Page-level RBAC (workflow:read) decides who actually renders anything from it, same as those other events. */
function emitWorkflowUpdate(tenantId, serializedInstance) {
  emitToTenant(tenantId, "workflow:updated", { workflow: serializedInstance });
}

module.exports = {
  MAX_STEP_ATTEMPTS,
  TERMINAL_INSTANCE_STATUSES,
  startOrGetInstance,
  withLockedInstance,
  completeStep,
  skipStep,
  setCurrentStep,
  waitInstance,
  failInstance,
  completeInstance,
  cancelInstance,
  retryStep,
  registerAdvancer,
  runAdvancer,
  serializeInstance,
  serializeStep,
  listInstances,
  getInstance,
  emitWorkflowUpdate,
};
