import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma, tenantDb } from "@/lib/prismaClient";
import { detailsShape, toProfileData } from "@/lib/staffDetails";
import { applyDutyFromProfile } from "@/lib/staffSchedule";

export const dynamic = "force-dynamic";

// medicalNotes is privacy-sensitive: only this admin-gated route ever writes it, and only the admin directory ever reads it.
const patchSchema = z
  .object({ ...detailsShape, medicalNotes: z.string().trim().max(2000).optional(), workDays: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional() })
  .refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });

// Upsert — most staff won't have a profile row yet until an admin first
// fills one in.
export const PATCH = apiRoute("staff:manage", async (request, ctx) => {
  const { userId } = await ctx.params;
  const uid = BigInt(userId);

  const user = await prisma.users.findFirst({
    where: { id: uid, tenant_id: BigInt(ctx.session.tenantId) },
    select: { id: true },
  });
  if (!user) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);
  const patch = toProfileData(body);
  if (body.medicalNotes !== undefined) patch.medical_notes = body.medicalNotes || null;

  const existing = await tenantDb.staff_profiles.findUnique({ where: { user_id: uid } });
  if (existing) await tenantDb.staff_profiles.update({ where: { id: existing.id }, data: patch });
  else await tenantDb.staff_profiles.create({ data: { user_id: uid, ...patch } });

  await applyDutyFromProfile(ctx.session.tenantId, uid, body, ctx.session.userId);
  return json({ ok: true });
});
