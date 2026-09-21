import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma, tenantDb } from "@/lib/prismaClient";
import { detailsShape, toProfileData } from "@/lib/staffDetails";

export const dynamic = "force-dynamic";

const patchSchema = z.object(detailsShape).refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });

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

  const existing = await tenantDb.staff_profiles.findUnique({ where: { user_id: uid } });
  if (existing) await tenantDb.staff_profiles.update({ where: { id: existing.id }, data: patch });
  else await tenantDb.staff_profiles.create({ data: { user_id: uid, ...patch } });

  return json({ ok: true });
});
