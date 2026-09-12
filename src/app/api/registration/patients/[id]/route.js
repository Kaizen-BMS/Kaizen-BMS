import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  allergies: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  abhaId: z.string().trim().max(64).optional().or(z.literal("")),
  referralSourceId: z.coerce.number().int().positive().nullable().optional(),
});

// Edit a returning patient's allergy list / ABHA ID / referral source from
// the registration screen. Deliberately narrow — the rest of the patient
// record isn't editable from here.
export const PATCH = apiRoute("patient:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const patientId = BigInt(id);

  const existing = await tenantDb.patients.findUnique({
    where: { id: patientId },
    select: { id: true },
  });
  if (!existing) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);
  const patch = {};
  if (body.allergies !== undefined) {
    patch.allergies = body.allergies.length ? JSON.stringify(body.allergies) : null;
  }
  if (body.abhaId !== undefined) patch.abha_id = body.abhaId || null;
  if (body.referralSourceId !== undefined) {
    if (body.referralSourceId === null) {
      patch.referral_source_id = null;
    } else {
      // Verify it's this tenant's own source, same reasoning as on create.
      const source = await tenantDb.referral_sources.findUnique({
        where: { id: BigInt(body.referralSourceId) },
        select: { id: true },
      });
      if (!source) return json({ error: "referral_source_not_found" }, 400);
      patch.referral_source_id = source.id;
    }
  }

  await tenantDb.patients.update({ where: { id: patientId }, data: patch });
  const updated = await tenantDb.patients.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      name: true,
      age: true,
      phone: true,
      allergies: true,
      abha_id: true,
      referral_source_id: true,
      referral_sources: { select: { name: true, type: true } },
    },
  });
  const { referral_sources: rs, ...rest } = updated;
  const patient = { ...rest, referral_source_name: rs?.name || null, referral_source_type: rs?.type || null };

  emitToTenant(ctx.session.tenantId, "patient:updated", { patient });
  return json({ patient });
});
