import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma, tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    joinDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    phone: z.string().trim().max(32).optional().or(z.literal("")),
    designation: z.string().trim().max(100).optional().or(z.literal("")),
  })
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
  const patch = {};
  if (body.joinDate !== undefined) patch.join_date = body.joinDate ? new Date(body.joinDate) : null;
  if (body.phone !== undefined) patch.phone = body.phone || null;
  if (body.designation !== undefined) patch.designation = body.designation || null;

  const existing = await tenantDb.staff_profiles.findUnique({ where: { user_id: uid } });
  const profile = existing
    ? await tenantDb.staff_profiles.update({ where: { id: existing.id }, data: patch })
    : await tenantDb.staff_profiles.create({ data: { user_id: uid, ...patch } });

  return json({ profile });
});
