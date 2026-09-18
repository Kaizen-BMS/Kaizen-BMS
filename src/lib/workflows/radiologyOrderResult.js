"use strict";

/**
 * Workflow 4 — Radiology Order → Result (added the phase after Alerts &
 * Notifications Center). Same idempotent-advance shape as
 * opdPharmacyBilling.js/labResultBilling.js: `advance()` re-derives the
 * CURRENT real state from radiology_orders/bill_items every time it runs,
 * never a cached flag, and never performs a business action itself —
 * scheduling/reporting/billing all stay exactly where they already live
 * (the radiology order routes, billing/opd, billingEvents.js).
 *
 * CLINICAL_NOTIFIED is best-effort, same reasoning as Lab's own step: this
 * project ships the RADIOLOGY_RESULT_TO_CLINICAL contract but no route
 * creates a real RADIOLOGY -> DOCTOR_OPD connection by default (the
 * ordering doctor already sees a completed report via the existing
 * "radiology:result" realtime/notification event, independent of Module
 * Connections) — an unconfigured connection SKIPS this step rather than
 * blocking BILLING behind a dependency nobody is required to create.
 */
const { tenantDb } = require("../prismaClient");
const { runWithContext } = require("../requestContext");
const { serverEvents } = require("../realtime");
const { registerConsumer } = require("../outboxProcessor");
const { getDefaultInstance } = require("../moduleInstances");
const { checkContractAccess } = require("../moduleConnections");
const { resolveConnectedInstance } = require("../moduleConnectionResolver");
const {
  startOrGetInstance,
  withLockedInstance,
  completeStep,
  skipStep,
  setCurrentStep,
  waitInstance,
  failInstance,
  completeInstance,
  registerAdvancer,
  getInstance,
  emitWorkflowUpdate,
} = require("./engine");

const DEFINITION_CODE = "RADIOLOGY_ORDER_TO_RESULT";
const CONTRACT_TYPE = "RADIOLOGY_ORDER_ROUTING";
const CLINICAL_CONTRACT_TYPE = "RADIOLOGY_RESULT_TO_CLINICAL";
const REFERENCE_TYPE = "radiology_order";

async function ensureStarted(tenantId, radiologyOrderId, createdBy) {
  return startOrGetInstance(tenantDb, {
    tenantId,
    definitionCode: DEFINITION_CODE,
    referenceType: REFERENCE_TYPE,
    referenceId: radiologyOrderId,
    createdBy,
  });
}

async function advance(tenantId, radiologyOrderId) {
  await runWithContext({ tenantId }, async () => {
    const order = await tenantDb.radiology_orders.findUnique({
      where: { id: BigInt(radiologyOrderId) },
      include: { consultations: { select: { patient_id: true, doctor_id: true } } },
    });
    if (!order) return;

    const found = await tenantDb.workflow_instances.findFirst({
      where: { definition_code: DEFINITION_CODE, reference_type: REFERENCE_TYPE, reference_id: BigInt(radiologyOrderId) },
    });
    if (!found) return;

    await withLockedInstance(tenantDb, tenantId, found.id, async (tx, instance, steps) => {
      if (["COMPLETED", "CANCELLED", "FAILED"].includes(instance.status)) return;
      const byCode = Object.fromEntries(steps.map((s) => [s.step_code, s]));

      if (byCode.ORDER_CREATED.status !== "COMPLETED") await completeStep(tx, instance, "ORDER_CREATED");

      // Step 2 + 3 — Connection Center + Data Contract enforcement, same
      // discipline as OPD_PHARMACY_BILLING: never a silent default instance.
      const sourceInstance = await getDefaultInstance(tx, tenantId, "DOCTOR_OPD");
      if (!sourceInstance) return waitInstance(tx, instance, "CONNECTION_VALIDATED", "clinical_module_not_active");

      const resolved = await resolveConnectedInstance(tx, {
        sourceInstanceId: sourceInstance.id,
        targetModule: "RADIOLOGY",
        connectionType: CONTRACT_TYPE,
      });
      if (!resolved.ok) {
        if (resolved.reason === "connection_revoked") {
          return failInstance(tx, instance, "CONNECTION_VALIDATED", "connection_revoked");
        }
        if (resolved.reason === "needs_selection") {
          return waitInstance(tx, instance, "CONNECTION_VALIDATED", "multiple_radiology_instances_connected");
        }
        return waitInstance(tx, instance, "CONNECTION_VALIDATED", resolved.reason);
      }
      if (byCode.CONNECTION_VALIDATED.status !== "COMPLETED") {
        await completeStep(tx, instance, "CONNECTION_VALIDATED", { radiologyInstanceId: Number(resolved.instance.id) });
      }

      const access = await checkContractAccess(tx, {
        tenantId,
        sourceInstanceId: sourceInstance.id,
        targetInstanceId: resolved.instance.id,
        contractType: CONTRACT_TYPE,
        payload: {
          radiologyOrderId: Number(order.id),
          patientId: Number(order.consultations.patient_id),
          visitId: order.visit_id != null ? Number(order.visit_id) : null,
          doctorId: Number(order.consultations.doctor_id),
          studyName: order.study_name,
          priority: order.priority,
        },
      });
      if (!access.ok) {
        if (access.status === 422 || access.status === 404) {
          return failInstance(tx, instance, "CONTRACT_VALIDATED", access.error);
        }
        return waitInstance(tx, instance, "CONTRACT_VALIDATED", access.error);
      }
      if (byCode.CONTRACT_VALIDATED.status !== "COMPLETED") {
        await completeStep(tx, instance, "CONTRACT_VALIDATED");
      }

      // Step 4 — derived live: the report-submission route (unchanged) is
      // the only place status ever reaches COMPLETED.
      if (order.status !== "COMPLETED") return setCurrentStep(tx, instance, "REPORT_COMPLETED");
      if (byCode.REPORT_COMPLETED.status !== "COMPLETED") await completeStep(tx, instance, "REPORT_COMPLETED");

      // Step 5 — best-effort clinical visibility via the Data Contract
      // system, same pattern as Lab's CLINICAL_NOTIFIED.
      if (byCode.CLINICAL_NOTIFIED.status === "PENDING" || byCode.CLINICAL_NOTIFIED.status === "RUNNING") {
        const radInstance = await getDefaultInstance(tx, tenantId, "RADIOLOGY");
        const opdInstance = await getDefaultInstance(tx, tenantId, "DOCTOR_OPD");
        let notified = false;
        if (radInstance && opdInstance) {
          const clinicalAccess = await checkContractAccess(tx, {
            tenantId,
            sourceInstanceId: radInstance.id,
            targetInstanceId: opdInstance.id,
            contractType: CLINICAL_CONTRACT_TYPE,
            payload: {
              radiologyOrderId: Number(order.id),
              patientId: Number(order.consultations.patient_id),
              visitId: order.visit_id != null ? Number(order.visit_id) : null,
              status: order.status,
              reportedAt: order.reported_at ? order.reported_at.toISOString() : new Date().toISOString(),
            },
          });
          if (clinicalAccess.ok) {
            await completeStep(tx, instance, "CLINICAL_NOTIFIED");
            notified = true;
          }
        }
        if (!notified) await skipStep(tx, instance, "CLINICAL_NOTIFIED", "no_active_clinical_connection");
      }

      // Step 6 — BILLING_SYNCED derived from whether any bill has picked
      // up this order yet (OPD checkout or the IPD running-bill listener).
      const billed = await tx.bill_items.findFirst({ where: { reference_type: "radiology_order", reference_id: order.id } });
      if (!billed) return setCurrentStep(tx, instance, "BILLING_SYNCED");
      if (byCode.BILLING_SYNCED.status !== "COMPLETED") await completeStep(tx, instance, "BILLING_SYNCED");

      await completeInstance(tx, instance);
    });

    const updated = await getInstance(tenantDb, tenantId, found.id);
    if (updated) emitWorkflowUpdate(tenantId, updated);
  });
}

async function ensureAndAdvance(tenantId, radiologyOrderId, createdBy) {
  await runWithContext({ tenantId }, async () => {
    await ensureStarted(tenantId, radiologyOrderId, createdBy);
  });
  await advance(tenantId, radiologyOrderId);
}

registerAdvancer(DEFINITION_CODE, (tenantId, referenceId) => advance(tenantId, referenceId));

// ── Triggers ────────────────────────────────────────────────────────────

// Durable start, same worked pattern as PrescriptionCreated.
registerConsumer("RadiologyOrderCreated", async (payload, envelope) => {
  await ensureAndAdvance(envelope.tenantId, payload.radiologyOrderId, payload.createdBy);
});

// Realtime: report submission (radiology/orders/[id]/report route, unchanged).
serverEvents.on("radiology:result", ({ tenantId, payload }) => {
  const order = payload?.radiologyOrder;
  if (!order?.id) return;
  ensureAndAdvance(tenantId, order.id).catch((err) => console.error("[workflow:radiologyOrderResult] radiology:result failed", err));
});

// Realtime: OPD checkout billing / IPD running-bill sync — scan for
// radiology_order references the same way labResultBilling.js scans for
// lab_order references.
function handleBillEvent(tenantId, bill) {
  if (!bill || !Array.isArray(bill.bill_items)) return;
  runWithContext({ tenantId }, async () => {
    const orderIds = bill.bill_items.filter((i) => i.reference_type === "radiology_order").map((i) => Number(i.reference_id));
    for (const id of [...new Set(orderIds)]) await advance(tenantId, id);
  }).catch((err) => console.error("[workflow:radiologyOrderResult] bill event failed", err));
}

serverEvents.on("bill:created", ({ tenantId, payload }) => handleBillEvent(tenantId, payload?.bill));
serverEvents.on("bill:updated", ({ tenantId, payload }) => handleBillEvent(tenantId, payload?.bill));

module.exports = { DEFINITION_CODE, ensureAndAdvance, advance };
