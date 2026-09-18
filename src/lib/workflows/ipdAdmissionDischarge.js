"use strict";

/**
 * Workflow 3 — IPD Admission → Discharge (CLAUDE.md "Workflow
 * Automation"). Tracks one inpatient stay end to end using ONLY existing
 * IPD/Pharmacy/Lab/Billing behavior — this module never admits, transfers,
 * dispenses, results a test, or discharges anyone; it observes those
 * existing routes' realtime events and records progress.
 *
 * NURSING_RECORDED / PHARMACY_SYNCED / LAB_SYNCED are optional in real
 * life (a short, uneventful stay may have none of them) — `advance()`
 * marks each COMPLETED the moment it's observed, and only resolves the
 * ones still PENDING to SKIPPED once the patient has actually been
 * discharged (a real, valid outcome, not a failure — CLAUDE.md's own
 * workflow-3 diagram lists them as part of the flow, not as mandatory
 * gates).
 *
 * FINAL_BILL_GENERATED is not a separate manual action in this codebase —
 * billingEvents.js's existing "admission:discharged" listener already
 * appends the room charge and finalizes the IPD bill in the SAME event
 * this module also reacts to, so this step just confirms that fact rather
 * than re-implementing it (CLAUDE.md "Billing" / "do not create another
 * billing engine").
 */
const { tenantDb } = require("../prismaClient");
const { runWithContext } = require("../requestContext");
const { serverEvents } = require("../realtime");
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

const DEFINITION_CODE = "IPD_ADMISSION_TO_DISCHARGE";
const REFERENCE_TYPE = "admission";
const OPTIONAL_STEPS = ["NURSING_RECORDED", "PHARMACY_SYNCED", "LAB_SYNCED"];

async function ensureStarted(tenantId, admissionId, createdBy) {
  return startOrGetInstance(tenantDb, {
    tenantId,
    definitionCode: DEFINITION_CODE,
    referenceType: REFERENCE_TYPE,
    referenceId: admissionId,
    createdBy,
  });
}

async function advance(tenantId, admissionId) {
  await runWithContext({ tenantId }, async () => {
    const admission = await tenantDb.admissions.findUnique({ where: { id: BigInt(admissionId) } });
    if (!admission) return;

    const found = await tenantDb.workflow_instances.findFirst({
      where: { definition_code: DEFINITION_CODE, reference_type: REFERENCE_TYPE, reference_id: BigInt(admissionId) },
    });
    if (!found) return;

    await withLockedInstance(tenantDb, tenantId, found.id, async (tx, instance, steps) => {
      if (["COMPLETED", "CANCELLED", "FAILED"].includes(instance.status)) return;
      const byCode = Object.fromEntries(steps.map((s) => [s.step_code, s]));

      if (byCode.ADMITTED.status !== "COMPLETED") {
        await completeStep(tx, instance, "ADMITTED", { bedId: Number(admission.bed_id) });
      }

      const hasNursingNote = (await tx.nursing_notes.count({ where: { admission_id: admission.id } })) > 0;
      if (hasNursingNote && byCode.NURSING_RECORDED.status === "PENDING") {
        await completeStep(tx, instance, "NURSING_RECORDED");
      }

      const hasPharmacySync = await tx.bills.findFirst({
        where: { visit_id: admission.visit_id, bill_type: "IPD", bill_items: { some: { reference_type: "prescription_item" } } },
      });
      if (hasPharmacySync && byCode.PHARMACY_SYNCED.status === "PENDING") {
        await completeStep(tx, instance, "PHARMACY_SYNCED");
      }

      const hasLabSync = await tx.bills.findFirst({
        where: {
          visit_id: admission.visit_id,
          bill_type: "IPD",
          bill_items: { some: { reference_type: { in: ["lab_order", "lab_order_item"] } } },
        },
      });
      if (hasLabSync && byCode.LAB_SYNCED.status === "PENDING") {
        await completeStep(tx, instance, "LAB_SYNCED");
      }

      if (!admission.discharged_at) {
        return setCurrentStep(tx, instance, "DISCHARGED");
      }

      // Discharged — anything still PENDING among the optional steps
      // genuinely didn't happen this stay; that's a valid outcome.
      for (const code of OPTIONAL_STEPS) {
        if (byCode[code].status === "PENDING") await skipStep(tx, instance, code, "not_applicable_this_stay");
      }
      if (byCode.DISCHARGED.status !== "COMPLETED") await completeStep(tx, instance, "DISCHARGED");

      const finalBill = await tx.bills.findFirst({
        where: { visit_id: admission.visit_id, bill_type: "IPD", finalized_at: { not: null } },
      });
      if (!finalBill) return setCurrentStep(tx, instance, "FINAL_BILL_GENERATED");
      if (byCode.FINAL_BILL_GENERATED.status !== "COMPLETED") {
        await completeStep(tx, instance, "FINAL_BILL_GENERATED", { billId: Number(finalBill.id) });
      }

      await completeInstance(tx, instance);
    });

    const updated = await getInstance(tenantDb, tenantId, found.id);
    if (updated) emitWorkflowUpdate(tenantId, updated);
  });
}

async function ensureAndAdvance(tenantId, admissionId, createdBy) {
  // See opdPharmacyBilling.js's identical comment: startOrGetInstance()
  // needs its own tenant context, separate from advance()'s own.
  await runWithContext({ tenantId }, async () => {
    await ensureStarted(tenantId, admissionId, createdBy);
  });
  await advance(tenantId, admissionId);
}

registerAdvancer(DEFINITION_CODE, (tenantId, referenceId) => advance(tenantId, referenceId));

// ── Triggers ────────────────────────────────────────────────────────────

serverEvents.on("admission:created", ({ tenantId, payload }) => {
  const admission = payload?.admission;
  if (!admission?.id) return;
  ensureAndAdvance(tenantId, admission.id, admission.admitted_by).catch((err) =>
    console.error("[workflow:ipdAdmissionDischarge] admission:created failed", err),
  );
});

serverEvents.on("nursingnote:created", ({ tenantId, payload }) => {
  const admissionId = payload?.admissionId;
  if (!admissionId) return;
  advance(tenantId, admissionId).catch((err) => console.error("[workflow:ipdAdmissionDischarge] nursingnote:created failed", err));
});

/** dispense:created / lab:result also matter for OPD workflows (their own listeners elsewhere) — here we only care whether the prescription/lab order's visit belongs to a currently (or ever) admitted stay. */
serverEvents.on("dispense:created", ({ tenantId, payload }) => {
  const item = payload?.item;
  if (!item?.prescription_id) return;
  runWithContext({ tenantId }, async () => {
    const rx = await tenantDb.prescriptions.findUnique({ where: { id: BigInt(item.prescription_id) }, select: { visit_id: true } });
    if (!rx?.visit_id) return;
    const admission = await tenantDb.admissions.findFirst({ where: { visit_id: rx.visit_id }, orderBy: { admitted_at: "desc" } });
    if (admission) await advance(tenantId, admission.id);
  }).catch((err) => console.error("[workflow:ipdAdmissionDischarge] dispense:created failed", err));
});

serverEvents.on("lab:result", ({ tenantId, payload }) => {
  const labOrder = payload?.labOrder;
  if (!labOrder?.visit_id) return;
  runWithContext({ tenantId }, async () => {
    const admission = await tenantDb.admissions.findFirst({ where: { visit_id: BigInt(labOrder.visit_id) }, orderBy: { admitted_at: "desc" } });
    if (admission) await advance(tenantId, admission.id);
  }).catch((err) => console.error("[workflow:ipdAdmissionDischarge] lab:result failed", err));
});

serverEvents.on("admission:discharged", ({ tenantId, payload }) => {
  const admission = payload?.admission;
  if (!admission?.id) return;
  advance(tenantId, admission.id).catch((err) => console.error("[workflow:ipdAdmissionDischarge] admission:discharged failed", err));
});

module.exports = { DEFINITION_CODE, ensureAndAdvance, advance };
