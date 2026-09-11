import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { findById, updateById } from "@/lib/repo/tenant";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  allergies: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  abhaId: z.string().trim().max(64).optional().or(z.literal("")),
});

// Edit a returning patient's allergy list / ABHA ID from the registration
// screen. Deliberately narrow — the rest of the patient record isn't
// editable from here.
export const PATCH = apiRoute("patient:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const patientId = Number(id);

  const existing = await findById("patients", patientId, "id");
  if (!existing) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);
  const patch = {};
  if (body.allergies !== undefined) {
    patch.allergies = body.allergies.length ? JSON.stringify(body.allergies) : null;
  }
  if (body.abhaId !== undefined) patch.abha_id = body.abhaId || null;

  await updateById("patients", patientId, patch);
  const patient = await findById(
    "patients",
    patientId,
    "id, name, age, phone, allergies, abha_id",
  );

  emitToTenant(ctx.session.tenantId, "patient:updated", { patient });
  return json({ patient });
});
