"use strict";

/**
 * External Pharmacy orchestration — mirrors externalLab.js exactly.
 * CRITICAL invariant, satisfied by construction: this file never touches
 * `pharmacy_stock`/`pharmacy_stock_movements` — internal FEFO inventory
 * stays completely untouched no matter what an external pharmacy reports.
 * An externally-fulfilled prescription item is tracked purely through
 * `external_orders` + `prescription_items.status`, never through the
 * internal dispense ledger.
 */
const { tenantDb } = require("./prismaClient");
const { requireTenantId } = require("./requestContext");
const { HttpError } = require("./apiRoute");
const { getDefaultInstance } = require("./moduleInstances");
const { resolveExternalConnection, checkExternalContractAccess, enforceApprovedFields } = require("./externalConnections");
const { findOrCreateExternalOrder, markSent, markFailed } = require("./externalOrders");
const { mapExternalId, resolveExternalId } = require("./externalIdentifiers");
const { getAdapter } = require("./providerAdapters");
const { resolveAdapterContext } = require("./externalAdapterContext");
const { recordSuccess, recordFailure } = require("./integrationHealth");
const { emitToModule } = require("./realtime");

const CONTRACT_TYPE = "EXTERNAL_PHARMACY_PRESCRIPTION";

async function sendPrescriptionItemExternal({ prescriptionItemId, providerId, actorUserId }) {
  const tenantId = requireTenantId();

  const item = await tenantDb.prescription_items.findUnique({
    where: { id: BigInt(prescriptionItemId) },
    include: { prescriptions: { include: { consultations: { select: { patient_id: true } } } } },
  });
  if (!item) throw new HttpError(404, "prescription_item_not_found");

  const patientId = item.prescriptions.consultations.patient_id;
  const patient = await tenantDb.patients.findUnique({ where: { id: patientId }, select: { name: true } });

  const sourceInstance = await getDefaultInstance(tenantDb, tenantId, "DOCTOR_OPD");
  if (!sourceInstance) throw new HttpError(409, "clinical_module_not_active");

  const resolved = await resolveExternalConnection(tenantDb, { tenantId, sourceInstanceId: sourceInstance.id, connectionType: CONTRACT_TYPE, preferredProviderId: providerId });
  if (!resolved.ok) {
    if (resolved.reason === "needs_selection") throw new HttpError(409, "provider_selection_required");
    throw new HttpError(409, resolved.reason);
  }

  // External ID mapping (TASK 5) — see externalLab.js's identical comment.
  const [providerPatientId, providerMedicineCode] = await Promise.all([
    resolveExternalId(tenantDb, { tenantId, providerId: resolved.provider.id, entityType: "PATIENT", internalId: patientId }),
    item.service_id
      ? resolveExternalId(tenantDb, { tenantId, providerId: resolved.provider.id, entityType: "SERVICE", internalId: item.service_id })
      : null,
  ]);

  let payload = {
    visitId: item.prescriptions.visit_id != null ? Number(item.prescriptions.visit_id) : undefined,
    prescriptionItemId: Number(item.id),
    patientId: Number(patientId),
    patientName: patient?.name,
    medicineName: item.medicine_name,
    dosage: item.dosage || undefined,
    quantity: item.quantity,
    providerPatientId: providerPatientId || undefined,
    providerMedicineCode: providerMedicineCode || undefined,
  };

  // Consent enforcement: only what the connection approved can leave.
  payload = enforceApprovedFields(resolved.connection, payload);

  const access = await checkExternalContractAccess(tenantDb, {
    tenantId,
    sourceInstanceId: sourceInstance.id,
    providerId: resolved.provider.id,
    contractType: CONTRACT_TYPE,
    payload,
  });
  if (!access.ok) throw new HttpError(access.status, access.error);

  const externalOrder = await findOrCreateExternalOrder(tenantDb, {
    tenantId,
    providerId: resolved.provider.id,
    externalConnectionId: resolved.connection.id,
    orderType: "PHARMACY_PRESCRIPTION",
    internalReferenceType: "prescription_item",
    internalReferenceId: item.id,
    requestPayload: payload,
    createdBy: actorUserId,
  });

  if (externalOrder.status !== "PENDING") {
    return { externalOrder, alreadySent: true };
  }

  const adapter = getAdapter(resolved.provider.provider_code);
  const { provider: adapterProvider, credentials } = await resolveAdapterContext(tenantId, resolved.provider);
  const start = Date.now();
  let result;
  try {
    result = await adapter.createOrder({ payload, provider: adapterProvider, credentials });
  } catch (err) {
    await recordFailure(tenantDb, resolved.provider.id, { errorCategory: "adapter_error" });
    await markFailed(tenantDb, externalOrder.id, err.message);
    throw new HttpError(502, "external_provider_error");
  }
  if (!result.ok) {
    await recordFailure(tenantDb, resolved.provider.id, { errorCategory: "rejected", latencyMs: Date.now() - start });
    await markFailed(tenantDb, externalOrder.id, "provider rejected order");
    throw new HttpError(502, "external_provider_rejected");
  }

  await recordSuccess(tenantDb, resolved.provider.id, { latencyMs: Date.now() - start });
  // Mapping before markSent() — see externalLab.js's identical comment.
  await mapExternalId(tenantDb, { tenantId, providerId: resolved.provider.id, entityType: "PRESCRIPTION_ITEM", internalId: item.id, externalId: result.externalOrderRef });
  const updated = await markSent(tenantDb, externalOrder.id, { externalOrderRef: result.externalOrderRef, responsePayload: result.raw });

  emitToModule(tenantId, "PHARMACY", "externalorder:updated", { externalOrder: { id: Number(updated.id), status: updated.status, externalOrderRef: updated.external_order_ref, orderType: "PHARMACY_PRESCRIPTION" } });

  return { externalOrder: updated, alreadySent: false };
}

module.exports = { CONTRACT_TYPE, sendPrescriptionItemExternal };
