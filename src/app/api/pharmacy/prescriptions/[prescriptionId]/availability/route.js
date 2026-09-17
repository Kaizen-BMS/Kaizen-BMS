import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { getDefaultInstance } from "@/lib/moduleInstances";
import { checkContractAccess } from "@/lib/moduleConnections";

export const dynamic = "force-dynamic";

const CONTRACT_TYPE = "PRESCRIPTION_FULFILLMENT";

/**
 * The first real consumer of the Data Contract system (Phase 8C —
 * CLAUDE.md "First real cross-module data exchange — Prescription →
 * Pharmacy"). Read-only: identifies what a connected pharmacy instance
 * could dispense against a prescription, without ever touching stock —
 * the existing `POST /api/pharmacy/dispense/[itemId]` route (FEFO,
 * transaction-safe, unchanged) is still the only place a deduction
 * happens. This endpoint's whole job is answering "is Clinical actually
 * allowed to expose this prescription to this pharmacy instance, and if
 * so, what does it look like from there" — `checkContractAccess()`
 * (Phase 8B) is the real gate here, not a formality: no active
 * DOCTOR_OPD → PHARMACY connection means no availability data, period.
 */
export const GET = apiRoute("dispense:read", async (request, ctx) => {
  const { prescriptionId } = await ctx.params;
  const id = BigInt(prescriptionId);

  const prescription = await tenantDb.prescriptions.findUnique({
    where: { id },
    include: { consultations: { select: { patient_id: true, doctor_id: true } } },
  });
  if (!prescription) return json({ error: "not_found" }, 404);

  // The OPD side of this exchange — prescriptions don't carry their own
  // module_instance_id (DOCTOR_OPD has never needed multi-instance
  // selection; every tenant has exactly one), so this is always the
  // tenant's default DOCTOR_OPD instance, the same "no instanceId given"
  // resolution every other route in this codebase already uses.
  const sourceInstance = await getDefaultInstance(tenantDb, ctx.session.tenantId, "DOCTOR_OPD");
  if (!sourceInstance) throw new HttpError(409, "clinical_module_not_active");

  const pharmacyInstanceId = new URL(request.url).searchParams.get("pharmacyInstanceId");
  const targetInstance = await resolvePharmacyTarget(sourceInstance.id, pharmacyInstanceId);
  if (targetInstance.needsSelection) {
    return json({ error: "pharmacy_instance_required", options: targetInstance.options }, 409);
  }
  if (targetInstance.error) {
    throw new HttpError(targetInstance.status, targetInstance.error);
  }

  const access = await checkContractAccess(tenantDb, {
    tenantId: ctx.session.tenantId,
    sourceInstanceId: sourceInstance.id,
    targetInstanceId: targetInstance.instance.id,
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
    throw new HttpError(access.status, access.error);
  }

  const items = await tenantDb.prescription_items.findMany({
    where: { prescription_id: id },
    orderBy: { id: "asc" },
  });

  const mappedServiceIds = items.filter((it) => it.service_id != null).map((it) => it.service_id);
  const services = mappedServiceIds.length
    ? await tenantDb.services.findMany({ where: { id: { in: mappedServiceIds } }, select: { id: true, name: true } })
    : [];
  const serviceNameById = new Map(services.map((s) => [String(s.id), s.name]));

  // One aggregate query for every distinct medicine this prescription
  // needs, scoped to the ONE connected pharmacy instance — never the
  // whole tenant's inventory, and never a per-item round trip (CLAUDE.md
  // Phase 8C Part 22 "avoid N+1 inventory queries").
  const medicineNames = [...new Set(items.map((it) => it.medicine_name))];
  const stockSums = medicineNames.length
    ? await tenantDb.pharmacy_stock.groupBy({
        by: ["medicine_name"],
        where: {
          module_instance_id: targetInstance.instance.id,
          medicine_name: { in: medicineNames },
          quantity: { gt: 0 },
          OR: [{ expiry_date: null }, { expiry_date: { gte: new Date(new Date().toDateString()) } }],
        },
        _sum: { quantity: true },
      })
    : [];
  const availableByMedicine = new Map(stockSums.map((s) => [s.medicine_name, s._sum.quantity || 0]));

  const availabilityItems = items.map((it) => {
    const outstanding = it.quantity - it.dispensed_quantity;
    const availableQuantity = availableByMedicine.get(it.medicine_name) || 0;
    let status;
    if (it.service_id == null) status = "UNMAPPED";
    else if (outstanding <= 0) status = "FULFILLED";
    else if (availableQuantity <= 0) status = "OUT_OF_STOCK";
    else if (availableQuantity < outstanding) status = "PARTIAL";
    else status = "AVAILABLE";

    return {
      prescriptionItemId: Number(it.id),
      medicineName: it.medicine_name,
      serviceId: it.service_id != null ? Number(it.service_id) : null,
      serviceName: it.service_id != null ? serviceNameById.get(String(it.service_id)) || null : null,
      requestedQuantity: it.quantity,
      dispensedQuantity: it.dispensed_quantity,
      outstandingQuantity: Math.max(0, outstanding),
      availableQuantity: it.service_id != null ? availableQuantity : null,
      status,
      available: status === "AVAILABLE" || status === "FULFILLED",
    };
  });

  return json({
    prescriptionId: Number(prescription.id),
    prescriptionStatus: prescription.status,
    pharmacyInstanceId: Number(targetInstance.instance.id),
    pharmacyInstanceName: targetInstance.instance.name,
    items: availabilityItems,
  });
});

/**
 * Part 4's instance-resolution rule: only pharmacy instances the OPD
 * source instance actually has an ACTIVE PRESCRIPTION_FULFILLMENT
 * connection to are ever valid targets — never "the tenant's default
 * pharmacy" as a fallback, since that would silently bypass the whole
 * point of requiring a real connection. Zero connected instances is a
 * clean rejection; more than one requires the caller to say which.
 */
async function resolvePharmacyTarget(sourceInstanceId, pharmacyInstanceIdParam) {
  const connections = await tenantDb.module_connections.findMany({
    where: { source_instance_id: sourceInstanceId, connection_type: CONTRACT_TYPE, status: "ACTIVE" },
    include: { module_instances_module_connections_target_instance_idTomodule_instances: true },
  });
  const connectedInstances = connections
    .map((c) => c.module_instances_module_connections_target_instance_idTomodule_instances)
    .filter((inst) => inst && inst.module_name === "PHARMACY" && inst.status === "ACTIVE");

  if (connectedInstances.length === 0) {
    return { error: "no_active_connection", status: 409 };
  }

  if (pharmacyInstanceIdParam) {
    const match = connectedInstances.find((inst) => String(inst.id) === String(pharmacyInstanceIdParam));
    if (!match) return { error: "pharmacy_instance_not_connected", status: 409 };
    return { instance: match };
  }

  if (connectedInstances.length === 1) {
    return { instance: connectedInstances[0] };
  }

  return {
    needsSelection: true,
    options: connectedInstances.map((inst) => ({ id: Number(inst.id), name: inst.name })),
  };
}
