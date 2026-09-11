import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
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
  const consultationId = BigInt(id);
  const body = await parseBody(request, createSchema);

  const consultation = await tenantDb.consultations.findUnique({
    where: { id: consultationId },
    select: { id: true, visit_id: true, patient_id: true },
  });
  if (!consultation) return json({ error: "consultation_not_found" }, 404);

  const custom = await validateCustomFields(
    session.tenantId,
    "LAB_ORDER",
    body.customFields,
  );

  const created = await tenantDb.lab_orders.create({
    data: {
      visit_id: consultation.visit_id,
      consultation_id: consultation.id,
      patient_id: consultation.patient_id,
      tests: JSON.stringify(body.tests),
      custom_fields: custom ? JSON.stringify(custom) : null,
      status: "ORDERED",
      ordered_by: BigInt(session.userId),
    },
  });

  const withPatient = await tenantDb.lab_orders.findUnique({
    where: { id: created.id },
    include: { patients: { select: { name: true } } },
  });
  const { patients: p, ...rest } = withPatient;
  const labOrder = { ...rest, patient_name: p.name };

  // Routes to the Lab sub-room live, in this same request cycle.
  emitToModule(session.tenantId, "LAB", "laborder:created", { labOrder });

  return json({ labOrder }, 201);
});
