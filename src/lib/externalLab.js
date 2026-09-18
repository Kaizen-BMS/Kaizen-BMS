"use strict";

/**
 * External Lab orchestration — the ONE place provider-neutral business
 * logic ties together Connection/Contract enforcement, the adapter
 * registry, and the existing internal lab_orders table. Core Lab code
 * (lab/orders/* routes) is completely untouched — this is purely additive,
 * an alternate path a lab order can take at ordering time.
 */
const { tenantDb } = require("./prismaClient");
const { requireTenantId } = require("./requestContext");
const { HttpError } = require("./apiRoute");
const { getDefaultInstance } = require("./moduleInstances");
const { resolveExternalConnection, checkExternalContractAccess } = require("./externalConnections");
const { findOrCreateExternalOrder, markSent, markFailed } = require("./externalOrders");
const { mapExternalId, resolveExternalId } = require("./externalIdentifiers");
const { getAdapter } = require("./providerAdapters");
const { resolveAdapterContext } = require("./externalAdapterContext");
const { recordSuccess, recordFailure } = require("./integrationHealth");
const { emitToModule } = require("./realtime");

const CONTRACT_TYPE = "EXTERNAL_LAB_ORDER";

/** Send an internal lab order to a connected external lab provider. Never mutates the internal lab_orders row's own tests/results shape — only marks it as externally routed via the returned ExternalOrder record. */
async function sendLabOrderExternal({ labOrderId, providerId, actorUserId }) {
  const tenantId = requireTenantId();

  const order = await tenantDb.lab_orders.findUnique({
    where: { id: BigInt(labOrderId) },
    include: { patients: { select: { name: true, age: true } } },
  });
  if (!order) throw new HttpError(404, "lab_order_not_found");

  const sourceInstance = await getDefaultInstance(tenantDb, tenantId, "DOCTOR_OPD");
  if (!sourceInstance) throw new HttpError(409, "clinical_module_not_active");

  const resolved = await resolveExternalConnection(tenantDb, { tenantId, sourceInstanceId: sourceInstance.id, connectionType: CONTRACT_TYPE, preferredProviderId: providerId });
  if (!resolved.ok) {
    if (resolved.reason === "needs_selection") throw new HttpError(409, "provider_selection_required");
    throw new HttpError(409, resolved.reason);
  }

  const tests = typeof order.tests === "string" ? JSON.parse(order.tests) : order.tests || [];
  const testName = tests[0] || "Unspecified test";

  // External ID mapping (TASK 5) — included only when a mapping already
  // exists (external_identifiers, entity types PATIENT/SERVICE); never
  // invented. Nothing populates PATIENT mappings yet (no real adapter has
  // a "register patient" step to do so) — this is the read side of that
  // plumbing, ready for when one does. The test's own service_id (Phase
  // 7's explicit ordering-time mapping, never inferred from test-name
  // text) is the join key for a per-test provider code, mirroring the
  // exact "explicit mapping only" discipline already established for
  // billing.
  const [providerPatientId, testItem] = await Promise.all([
    resolveExternalId(tenantDb, { tenantId, providerId: resolved.provider.id, entityType: "PATIENT", internalId: order.patient_id }),
    tenantDb.lab_order_items.findFirst({ where: { lab_order_id: order.id, test_name: testName }, select: { service_id: true } }),
  ]);
  const providerTestCode = testItem?.service_id
    ? await resolveExternalId(tenantDb, { tenantId, providerId: resolved.provider.id, entityType: "SERVICE", internalId: testItem.service_id })
    : null;

  const payload = {
    labOrderId: Number(order.id),
    patientId: Number(order.patient_id),
    patientName: order.patients?.name,
    patientAge: order.patients?.age ?? undefined,
    doctorId: order.ordered_by != null ? Number(order.ordered_by) : undefined,
    testName,
    priority: "ROUTINE",
    providerPatientId: providerPatientId || undefined,
    providerTestCode: providerTestCode || undefined,
  };

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
    orderType: "LAB_ORDER",
    internalReferenceType: "lab_order",
    internalReferenceId: order.id,
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
  // Mapping written BEFORE markSent(), not after: a "SENT but unmapped"
  // order can never happen this way. A crash between the two used to be
  // possible in the other order — found live while testing this flow —
  // and once an order reaches SENT, findOrCreateExternalOrder()'s
  // idempotent short-circuit means a retry would never revisit an
  // unmapped identifier.
  await mapExternalId(tenantDb, { tenantId, providerId: resolved.provider.id, entityType: "LAB_ORDER", internalId: order.id, externalId: result.externalOrderRef });
  const updated = await markSent(tenantDb, externalOrder.id, { externalOrderRef: result.externalOrderRef, responsePayload: result.raw });

  emitToModule(tenantId, "LAB", "externalorder:updated", { externalOrder: { id: Number(updated.id), status: updated.status, externalOrderRef: updated.external_order_ref, orderType: "LAB_ORDER" } });

  return { externalOrder: updated, alreadySent: false };
}

module.exports = { CONTRACT_TYPE, sendLabOrderExternal };
