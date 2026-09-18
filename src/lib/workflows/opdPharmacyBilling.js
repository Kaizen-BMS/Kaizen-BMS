"use strict";

/**
 * Workflow 1 — OPD → Pharmacy → Billing (CLAUDE.md "Workflow Automation").
 * Tracks a prescription from creation through a connected pharmacy's
 * availability check, dispensing, and OPD checkout billing — it never
 * performs any of those actions itself:
 *
 *   - Prescription creation (opd/consultations/[id]/prescriptions) already
 *     never deducts stock — unchanged.
 *   - Dispensing (pharmacy/dispense/[itemId]) is still the ONLY place
 *     inventory is deducted — unchanged, this module only observes its
 *     result via the "prescription:updated" realtime event.
 *   - Billing (billing/opd) still owns all billing logic — unchanged,
 *     this module only observes a bill's items via "bill:created".
 *
 * `advance()` is the one function that actually decides progress. It is
 * safe to call redundantly from any trigger (a redelivered Outbox event,
 * a realtime event, a manual retry) because it always re-derives the
 * TRUE current state from the real domain tables rather than trusting a
 * cached flag — this is what makes the whole thing idempotent and
 * concurrency-safe without a bespoke dedup table.
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
  setCurrentStep,
  waitInstance,
  failInstance,
  completeInstance,
  registerAdvancer,
  getInstance,
  emitWorkflowUpdate,
} = require("./engine");

const DEFINITION_CODE = "OPD_PHARMACY_BILLING";
const CONTRACT_TYPE = "PRESCRIPTION_FULFILLMENT";
const REFERENCE_TYPE = "prescription";

async function ensureStarted(tenantId, prescriptionId, createdBy) {
  return startOrGetInstance(tenantDb, {
    tenantId,
    definitionCode: DEFINITION_CODE,
    referenceType: REFERENCE_TYPE,
    referenceId: prescriptionId,
    createdBy,
  });
}

/**
 * Re-derive and advance as far as the real world currently allows. Never
 * throws for a normal business/connection condition — those become
 * WAITING/FAILED instance states instead (CLAUDE.md "Error handling" —
 * never swallow silently, never crash the caller either).
 */
async function advance(tenantId, prescriptionId) {
  await runWithContext({ tenantId }, async () => {
    const prescription = await tenantDb.prescriptions.findUnique({
      where: { id: BigInt(prescriptionId) },
      include: { consultations: { select: { patient_id: true, doctor_id: true } } },
    });
    if (!prescription) return;

    const found = await tenantDb.workflow_instances.findFirst({
      where: { definition_code: DEFINITION_CODE, reference_type: REFERENCE_TYPE, reference_id: BigInt(prescriptionId) },
    });
    if (!found) return;

    await withLockedInstance(tenantDb, tenantId, found.id, async (tx, instance, steps) => {
      if (["COMPLETED", "CANCELLED", "FAILED"].includes(instance.status)) return;
      const byCode = Object.fromEntries(steps.map((s) => [s.step_code, s]));

      if (byCode.PRESCRIPTION_CREATED.status !== "COMPLETED") {
        await completeStep(tx, instance, "PRESCRIPTION_CREATED");
      }

      // Step 2 + 3 — Connection Center + Data Contract enforcement
      // (CLAUDE.md "Module connection requirement" / "Data contract
      // requirement"): never bypassed, never a silent default instance.
      const sourceInstance = await getDefaultInstance(tx, tenantId, "DOCTOR_OPD");
      if (!sourceInstance) return waitInstance(tx, instance, "CONNECTION_VALIDATED", "clinical_module_not_active");

      const resolved = await resolveConnectedInstance(tx, {
        sourceInstanceId: sourceInstance.id,
        targetModule: "PHARMACY",
        connectionType: CONTRACT_TYPE,
      });
      if (!resolved.ok) {
        if (resolved.reason === "connection_revoked") {
          return failInstance(tx, instance, "CONNECTION_VALIDATED", "connection_revoked");
        }
        if (resolved.reason === "needs_selection") {
          return waitInstance(tx, instance, "CONNECTION_VALIDATED", "multiple_pharmacy_instances_connected");
        }
        return waitInstance(tx, instance, "CONNECTION_VALIDATED", resolved.reason);
      }
      if (byCode.CONNECTION_VALIDATED.status !== "COMPLETED") {
        await completeStep(tx, instance, "CONNECTION_VALIDATED", { pharmacyInstanceId: Number(resolved.instance.id) });
      }

      const access = await checkContractAccess(tx, {
        tenantId,
        sourceInstanceId: sourceInstance.id,
        targetInstanceId: resolved.instance.id,
        contractType: CONTRACT_TYPE,
        payload: {
          prescriptionId: Number(prescription.id),
          patientId: Number(prescription.consultations.patient_id),
          visitId: prescription.visit_id != null ? Number(prescription.visit_id) : null,
          doctorId: Number(prescription.consultations.doctor_id),
          status: prescription.status,
          createdAt: prescription.created_at.toISOString(),
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

      // Step 4 — read-only availability snapshot, same aggregate query
      // shape as the real availability route; never touches stock.
      if (byCode.AVAILABILITY_CHECK.status !== "COMPLETED") {
        const items = await tx.prescription_items.findMany({ where: { prescription_id: prescription.id } });
        const medicineNames = [...new Set(items.map((i) => i.medicine_name))];
        const stockSums = medicineNames.length
          ? await tx.pharmacy_stock.groupBy({
              by: ["medicine_name"],
              where: { module_instance_id: resolved.instance.id, medicine_name: { in: medicineNames }, quantity: { gt: 0 } },
              _sum: { quantity: true },
            })
          : [];
        const availableByMedicine = new Map(stockSums.map((s) => [s.medicine_name, s._sum.quantity || 0]));
        const summary = {
          itemCount: items.length,
          availableCount: items.filter((it) => (availableByMedicine.get(it.medicine_name) || 0) >= it.quantity).length,
        };
        await completeStep(tx, instance, "AVAILABILITY_CHECK", summary);
      }

      // Step 5 — DISPENSING is derived live: the FEFO dispense route
      // (unchanged) is the only place dispensed_quantity ever moves.
      const freshItems = await tx.prescription_items.findMany({
        where: { prescription_id: prescription.id },
        select: { dispensed_quantity: true },
      });
      const anyDispensed = freshItems.some((i) => i.dispensed_quantity > 0);
      if (!anyDispensed) return setCurrentStep(tx, instance, "DISPENSING");
      if (byCode.DISPENSING.status !== "COMPLETED") {
        await completeStep(tx, instance, "DISPENSING", { dispensedItems: freshItems.filter((i) => i.dispensed_quantity > 0).length });
      }

      // Step 6 — BILLING is derived live: has an OPD bill picked up any of
      // this prescription's items yet (billing/opd route, unchanged)?
      const itemIds = (
        await tx.prescription_items.findMany({ where: { prescription_id: prescription.id }, select: { id: true } })
      ).map((i) => i.id);
      const billed = itemIds.length
        ? await tx.bill_items.findFirst({ where: { reference_type: "prescription_item", reference_id: { in: itemIds } } })
        : null;
      if (!billed) return setCurrentStep(tx, instance, "BILLING");
      if (byCode.BILLING.status !== "COMPLETED") await completeStep(tx, instance, "BILLING");

      await completeInstance(tx, instance);
    });

    const updated = await getInstance(tenantDb, tenantId, found.id);
    if (updated) emitWorkflowUpdate(tenantId, updated);
  });
}

async function ensureAndAdvance(tenantId, prescriptionId, createdBy) {
  // startOrGetInstance() uses tenantDb, which requires an active tenant
  // context (requireTenantId()) — advance() wraps its own body in
  // runWithContext already, but this call happens BEFORE that, so it
  // needs its own wrapping too (nesting runWithContext with the same
  // tenantId is safe — see prismaClient.js's context-propagation note).
  await runWithContext({ tenantId }, async () => {
    await ensureStarted(tenantId, prescriptionId, createdBy);
  });
  await advance(tenantId, prescriptionId);
}

registerAdvancer(DEFINITION_CODE, (tenantId, referenceId) => advance(tenantId, referenceId));

// ── Triggers ────────────────────────────────────────────────────────────

// Durable start: the Outbox's own worked example (CLAUDE.md "Event-driven
// start"). At-least-once delivery is safe here — startOrGetInstance()'s
// unique constraint makes a redelivered PrescriptionCreated a no-op
// find-not-create, satisfying test #4 ("duplicate does not duplicate").
registerConsumer("PrescriptionCreated", async (payload, envelope) => {
  await ensureAndAdvance(envelope.tenantId, payload.prescriptionId, payload.createdBy);
});

// Realtime: dispensing progress (fired by the FEFO dispense route, unchanged).
serverEvents.on("prescription:updated", ({ tenantId, payload }) => {
  const prescription = payload?.prescription;
  if (!prescription?.id) return;
  ensureAndAdvance(tenantId, prescription.id).catch((err) =>
    console.error("[workflow:opdPharmacyBilling] prescription:updated failed", err),
  );
});

// Realtime: OPD checkout billing (billing/opd route, unchanged).
serverEvents.on("bill:created", ({ tenantId, payload }) => {
  const bill = payload?.bill;
  if (!bill || bill.bill_type !== "OPD" || !Array.isArray(bill.bill_items)) return;
  const prescItemIds = bill.bill_items.filter((i) => i.reference_type === "prescription_item").map((i) => i.reference_id);
  if (!prescItemIds.length) return;
  runWithContext({ tenantId }, async () => {
    const rows = await tenantDb.prescription_items.findMany({
      where: { id: { in: prescItemIds } },
      select: { prescription_id: true },
    });
    const prescriptionIds = [...new Set(rows.map((r) => Number(r.prescription_id)))];
    for (const pid of prescriptionIds) await advance(tenantId, pid);
  }).catch((err) => console.error("[workflow:opdPharmacyBilling] bill:created failed", err));
});

module.exports = { DEFINITION_CODE, ensureAndAdvance, advance };
