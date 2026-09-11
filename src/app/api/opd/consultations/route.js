import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { insert, updateById, findById, scopedQueryOne } from "@/lib/repo/tenant";
import { validateCustomFields } from "@/lib/forms";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  visitId: z.coerce.number().int().positive(),
  notes: z.string().trim().max(5000).optional().default(""),
  diagnosis: z.string().trim().max(500).optional().default(""),
  fee: z.coerce.number().min(0).max(1_000_000),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const POST = apiRoute("consultation:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);

  const visit = await findById("visits", body.visitId, "id, patient_id, status");
  if (!visit) return json({ error: "visit_not_found" }, 404);
  if (visit.status === "DISCHARGED" || visit.status === "CANCELLED") {
    return json({ error: "visit_closed" }, 409);
  }

  const custom = await validateCustomFields(
    session.tenantId,
    "CONSULTATION",
    body.customFields,
  );

  const consultationId = await insert("consultations", {
    visit_id: visit.id,
    patient_id: visit.patient_id,
    doctor_id: session.userId,
    notes: body.notes || null,
    diagnosis: body.diagnosis || null,
    fee: body.fee,
    custom_fields: custom ? JSON.stringify(custom) : null,
  });

  if (visit.status === "REGISTERED") {
    await updateById("visits", visit.id, { status: "WITH_DOCTOR" });
    emitToTenant(session.tenantId, "visit:updated", {
      visit: { id: visit.id, status: "WITH_DOCTOR" },
    });
  }

  const consultation = await scopedQueryOne(
    `SELECT c.*, p.name AS patient_name
       FROM consultations c JOIN patients p ON p.id = c.patient_id
      WHERE c.tenant_id = :tid AND c.id = :id`,
    { id: consultationId },
  );

  // Same request cycle. Hospital-wide board event (front desk + OPD queue).
  emitToTenant(session.tenantId, "consultation:created", { consultation });

  return json({ consultation }, 201);
});
