import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { insert, findById, scopedQueryOne } from "@/lib/repo/tenant";
import { validateCustomFields } from "@/lib/forms";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  tests: z
    .array(z.string().trim().min(1).max(191))
    .min(1)
    .max(50),
  notes: z.string().trim().max(500).optional().default(""),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const POST = apiRoute("laborder:create", async (request, ctx) => {
  const { session } = ctx;
  const { id } = await ctx.params;
  const consultationId = Number(id);
  const body = await parseBody(request, createSchema);

  const consultation = await findById(
    "consultations",
    consultationId,
    "id, visit_id, patient_id",
  );
  if (!consultation) return json({ error: "consultation_not_found" }, 404);

  const custom = await validateCustomFields(
    session.tenantId,
    "LAB_ORDER",
    body.customFields,
  );

  const labOrderId = await insert("lab_orders", {
    visit_id: consultation.visit_id,
    consultation_id: consultation.id,
    patient_id: consultation.patient_id,
    tests: JSON.stringify(body.tests),
    custom_fields: custom ? JSON.stringify(custom) : null,
    status: "ORDERED",
    ordered_by: session.userId,
  });

  const labOrder = await scopedQueryOne(
    `SELECT lo.*, p.name AS patient_name
       FROM lab_orders lo JOIN patients p ON p.id = lo.patient_id
      WHERE lo.tenant_id = :tid AND lo.id = :id`,
    { id: labOrderId },
  );

  // Routes to the Lab sub-room live, in this same request cycle.
  emitToModule(session.tenantId, "LAB", "laborder:created", { labOrder });

  return json({ labOrder }, 201);
});
