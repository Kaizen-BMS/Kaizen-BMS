import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToModule, emitToTenant } from "@/lib/realtime";
import { writeOutboxEvent } from "@/lib/outbox";
import { reportSchema, serializeOrder } from "@/lib/radiology";

export const dynamic = "force-dynamic";

// Submitting a report IS completing the study for this initial pass — see
// src/lib/radiology.js's own comment for why a 6th "study done, report
// pending" status wasn't added. Locks the order row with
// `SELECT ... FOR UPDATE` before checking/transitioning status — the same
// technique already used for Pharmacy's dispense route and IPD discharge —
// so two radiology staff submitting the same order at once can never both
// "win" (CLAUDE.md Radiology test #12, "duplicate completion protection").
export const POST = apiRoute("radiology:report", async (request, ctx) => {
  const { id } = await ctx.params;
  const orderId = BigInt(id);
  const tid = requireTenantId();
  const body = await parseBody(request, reportSchema);

  const result = await tenantDb.$transaction(async (tx) => {
    const [locked] = await tx.$queryRawUnsafe(
      `SELECT * FROM radiology_orders WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      orderId,
      BigInt(tid),
    );
    if (!locked) throw new HttpError(404, "not_found");
    if (locked.status === "COMPLETED" || locked.status === "CANCELLED") {
      throw new HttpError(409, "order_already_finalized");
    }

    await tx.radiology_orders.update({
      where: { id: orderId },
      data: {
        status: "COMPLETED",
        completed_at: new Date(),
        findings: body.findings || null,
        impression: body.impression,
        reported_by: BigInt(ctx.session.userId),
        reported_at: new Date(),
      },
    });

    await writeOutboxEvent(tx, {
      tenantId: ctx.session.tenantId,
      eventType: "RadiologyResultCompleted",
      aggregateType: "RadiologyOrder",
      aggregateId: orderId,
      payload: {
        radiologyOrderId: Number(orderId),
        patientId: Number(locked.patient_id),
        visitId: locked.visit_id != null ? Number(locked.visit_id) : null,
        reportedBy: ctx.session.userId,
      },
    });

    return tx.radiology_orders.findUnique({
      where: { id: orderId },
      include: { patients: { select: { name: true } } },
    });
  });

  const radiologyOrder = serializeOrder(result);

  emitToModule(ctx.session.tenantId, "RADIOLOGY", "radiologyorder:updated", { radiologyOrder });
  // Same event name shape as "lab:result" — the notification bell and
  // billingEvents.js's IPD running-bill listener both react to this.
  emitToTenant(ctx.session.tenantId, "radiology:result", { radiologyOrder });

  return json({ radiologyOrder });
});
