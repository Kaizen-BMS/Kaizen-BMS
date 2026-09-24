import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { validateCustomFields } from "@/lib/forms";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Correct or extend the notes after the fact (e.g. once the reports are back).
// The fee is priced at creation and is deliberately not editable here.
const patchSchema = z.object({
  notes: z.string().trim().max(5000).optional(),
  diagnosis: z.string().trim().max(500).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = apiRoute("consultation:create", async (request, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(request, patchSchema);

  const existing = await tenantDb.consultations.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return json({ error: "not_found" }, 404);
  if (String(existing.doctor_id) !== String(ctx.session.userId) && ctx.session.role === "DOCTOR") {
    return json({ error: "not_your_consultation" }, 403);
  }

  const data = {};
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (body.diagnosis !== undefined) data.diagnosis = body.diagnosis || null;
  if (body.customFields !== undefined) {
    const custom = await validateCustomFields(ctx.session.tenantId, "CONSULTATION", body.customFields);
    data.custom_fields = custom ? JSON.stringify(custom) : null;
  }
  if (Object.keys(data).length === 0) return json({ consultation: existing });

  const updated = await tenantDb.consultations.update({ where: { id: existing.id }, data });
  const withPatient = await tenantDb.consultations.findUnique({
    where: { id: updated.id },
    include: { patients: { select: { name: true } } },
  });
  const { patients: p, ...rest } = withPatient;
  const consultation = { ...rest, patient_name: p.name };
  emitToTenant(ctx.session.tenantId, "consultation:created", { consultation });
  return json({ consultation });
});
