"use strict";

/**
 * Workflow 2 — Lab Order → Result → Billing (CLAUDE.md "Workflow
 * Automation"). Tracks a lab order's own pipeline: order created, result
 * entered, (best-effort) clinical visibility via the Data Contract system,
 * and billing. Never duplicates a lab record or a billing calculation —
 * `advance()` only reads lab_orders/lab_order_items/bill_items and records
 * what it observes, the same "re-derive fresh truth every time" idempotent
 * shape as opdPharmacyBilling.js.
 *
 * CLINICAL_NOTIFIED is deliberately best-effort: this project ships the
 * LAB_RESULT_TO_CLINICAL contract (Phase 8B) but no route creates a real
 * LAB -> DOCTOR_OPD connection by default (the doctor already sees a
 * result via the existing "lab:result" realtime/notification event,
 * independent of Module Connections). Forcing this step to block the rest
 * of the workflow on a connection nobody is required to create would be a
 * fabricated dependency, not a real one — so an unconfigured connection
 * SKIPS this step rather than blocking BILLING behind it. When a real
 * connection IS configured, checkContractAccess() genuinely gates it.
 */
const { tenantDb } = require("../prismaClient");
const { runWithContext } = require("../requestContext");
const { serverEvents } = require("../realtime");
const { getDefaultInstance } = require("../moduleInstances");
const { checkContractAccess } = require("../moduleConnections");
const {
  startOrGetInstance,
  withLockedInstance,
  completeStep,
  skipStep,
  setCurrentStep,
  completeInstance,
  registerAdvancer,
  getInstance,
  emitWorkflowUpdate,
} = require("./engine");

const DEFINITION_CODE = "LAB_RESULT_BILLING";
const CONTRACT_TYPE = "LAB_RESULT_TO_CLINICAL";
const REFERENCE_TYPE = "lab_order";

async function ensureStarted(tenantId, labOrderId, createdBy) {
  return startOrGetInstance(tenantDb, {
    tenantId,
    definitionCode: DEFINITION_CODE,
    referenceType: REFERENCE_TYPE,
    referenceId: labOrderId,
    createdBy,
  });
}

async function advance(tenantId, labOrderId) {
  await runWithContext({ tenantId }, async () => {
    const order = await tenantDb.lab_orders.findUnique({ where: { id: BigInt(labOrderId) } });
    if (!order) return;

    const found = await tenantDb.workflow_instances.findFirst({
      where: { definition_code: DEFINITION_CODE, reference_type: REFERENCE_TYPE, reference_id: BigInt(labOrderId) },
    });
    if (!found) return;

    await withLockedInstance(tenantDb, tenantId, found.id, async (tx, instance, steps) => {
      if (["COMPLETED", "CANCELLED", "FAILED"].includes(instance.status)) return;
      const byCode = Object.fromEntries(steps.map((s) => [s.step_code, s]));

      if (byCode.ORDER_CREATED.status !== "COMPLETED") await completeStep(tx, instance, "ORDER_CREATED");

      if (!order.resulted_at) return setCurrentStep(tx, instance, "RESULT_ENTERED");
      if (byCode.RESULT_ENTERED.status !== "COMPLETED") await completeStep(tx, instance, "RESULT_ENTERED");

      if (byCode.CLINICAL_NOTIFIED.status === "PENDING" || byCode.CLINICAL_NOTIFIED.status === "RUNNING") {
        const labInstance = await getDefaultInstance(tx, tenantId, "LAB");
        const opdInstance = await getDefaultInstance(tx, tenantId, "DOCTOR_OPD");
        let notified = false;
        if (labInstance && opdInstance) {
          const access = await checkContractAccess(tx, {
            tenantId,
            sourceInstanceId: labInstance.id,
            targetInstanceId: opdInstance.id,
            contractType: CONTRACT_TYPE,
            payload: {
              labOrderId: Number(order.id),
              patientId: Number(order.patient_id),
              visitId: order.visit_id != null ? Number(order.visit_id) : null,
              status: order.status,
              resultedAt: order.resulted_at.toISOString(),
            },
          });
          if (access.ok) {
            await completeStep(tx, instance, "CLINICAL_NOTIFIED");
            notified = true;
          }
        }
        if (!notified) await skipStep(tx, instance, "CLINICAL_NOTIFIED", "no_active_clinical_connection");
      }

      const mappedItemIds = (
        await tx.lab_order_items.findMany({ where: { lab_order_id: order.id }, select: { id: true } })
      ).map((i) => i.id);
      const billed = await tx.bill_items.findFirst({
        where: {
          OR: [
            { reference_type: "lab_order", reference_id: order.id },
            ...(mappedItemIds.length ? [{ reference_type: "lab_order_item", reference_id: { in: mappedItemIds } }] : []),
          ],
        },
      });
      if (!billed) return setCurrentStep(tx, instance, "BILLING_SYNCED");
      if (byCode.BILLING_SYNCED.status !== "COMPLETED") await completeStep(tx, instance, "BILLING_SYNCED");

      await completeInstance(tx, instance);
    });

    const updated = await getInstance(tenantDb, tenantId, found.id);
    if (updated) emitWorkflowUpdate(tenantId, updated);
  });
}

async function ensureAndAdvance(tenantId, labOrderId, createdBy) {
  // See opdPharmacyBilling.js's identical comment: startOrGetInstance()
  // needs its own tenant context, separate from advance()'s own.
  await runWithContext({ tenantId }, async () => {
    await ensureStarted(tenantId, labOrderId, createdBy);
  });
  await advance(tenantId, labOrderId);
}

registerAdvancer(DEFINITION_CODE, (tenantId, referenceId) => advance(tenantId, referenceId));

// ── Triggers ────────────────────────────────────────────────────────────

serverEvents.on("laborder:created", ({ tenantId, payload }) => {
  const labOrder = payload?.labOrder;
  if (!labOrder?.id) return;
  ensureAndAdvance(tenantId, labOrder.id, labOrder.ordered_by).catch((err) =>
    console.error("[workflow:labResultBilling] laborder:created failed", err),
  );
});

// "lab:result" fires via emitToTenant (see lab/orders/[id]/result/route.js) —
// same event name the topbar notification bell already listens for.
serverEvents.on("lab:result", ({ tenantId, payload }) => {
  const labOrder = payload?.labOrder;
  if (!labOrder?.id) return;
  ensureAndAdvance(tenantId, labOrder.id).catch((err) => console.error("[workflow:labResultBilling] lab:result failed", err));
});

/** Scan a bill's items for anything lab-related and advance every matching LAB_RESULT_BILLING instance — shared by both the OPD "bill:created" and IPD "bill:updated" (billingEvents.js) triggers. */
function handleBillEvent(tenantId, bill) {
  if (!bill || !Array.isArray(bill.bill_items)) return;
  runWithContext({ tenantId }, async () => {
    const directIds = bill.bill_items.filter((i) => i.reference_type === "lab_order").map((i) => Number(i.reference_id));
    const itemRefIds = bill.bill_items.filter((i) => i.reference_type === "lab_order_item").map((i) => i.reference_id);
    let viaItems = [];
    if (itemRefIds.length) {
      const rows = await tenantDb.lab_order_items.findMany({ where: { id: { in: itemRefIds } }, select: { lab_order_id: true } });
      viaItems = rows.map((r) => Number(r.lab_order_id));
    }
    const labOrderIds = [...new Set([...directIds, ...viaItems])];
    for (const id of labOrderIds) await advance(tenantId, id);
  }).catch((err) => console.error("[workflow:labResultBilling] bill event failed", err));
}

serverEvents.on("bill:created", ({ tenantId, payload }) => handleBillEvent(tenantId, payload?.bill));
serverEvents.on("bill:updated", ({ tenantId, payload }) => handleBillEvent(tenantId, payload?.bill));

module.exports = { DEFINITION_CODE, ensureAndAdvance, advance };
