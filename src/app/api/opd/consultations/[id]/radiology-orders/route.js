import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";
import { writeOutboxEvent } from "@/lib/outbox";
import { createOrderSchema, serializeOrder } from "@/lib/radiology";

export const dynamic = "force-dynamic";

// Mirrors opd/consultations/[id]/lab-orders exactly, one study per order
// (not a bundle) — see src/lib/radiology.js's own file comment for why.
export const POST = apiRoute("radiology:create", async (request, ctx) => {
  const { session } = ctx;
  const { id } = await ctx.params;
  const consultationId = BigInt(id);
  const body = await parseBody(request, createOrderSchema);

  const consultation = await tenantDb.consultations.findUnique({
    where: { id: consultationId },
    select: { id: true, visit_id: true, patient_id: true },
  });
  if (!consultation) return json({ error: "consultation_not_found" }, 404);

  const { orderId } = await tenantDb.$transaction(async (tx) => {
    const created = await tx.radiology_orders.create({
      data: {
        visit_id: consultation.visit_id,
        consultation_id: consultationId,
        patient_id: consultation.patient_id,
        service_id: body.serviceId ?? null,
        study_name: body.studyName,
        priority: body.priority,
        status: "ORDERED",
        ordered_by: BigInt(session.userId),
      },
    });
    // Durable event, same transaction as the order write (CLAUDE.md
    // "Outbox — durable domain events") — starts/advances the
    // RADIOLOGY_ORDER_TO_RESULT workflow the same way PrescriptionCreated
    // already starts OPD_PHARMACY_BILLING. Not the realtime emit below —
    // that stays zero-delay and untouched by this.
    await writeOutboxEvent(tx, {
      tenantId: session.tenantId,
      eventType: "RadiologyOrderCreated",
      aggregateType: "RadiologyOrder",
      aggregateId: created.id,
      payload: {
        radiologyOrderId: Number(created.id),
        patientId: Number(consultation.patient_id),
        visitId: consultation.visit_id != null ? Number(consultation.visit_id) : null,
        consultationId: Number(consultationId),
        createdBy: session.userId,
      },
    });
    return { orderId: created.id };
  });

  const withPatient = await tenantDb.radiology_orders.findUnique({
    where: { id: orderId },
    include: { patients: { select: { name: true } } },
  });
  const order = serializeOrder(withPatient);

  // Routes to the Radiology sub-room live, in this same request cycle.
  emitToModule(session.tenantId, "RADIOLOGY", "radiologyorder:created", { radiologyOrder: order });

  return json({ radiologyOrder: order }, 201);
});
