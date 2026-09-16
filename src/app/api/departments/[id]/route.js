import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    active: z.coerce.boolean().optional(),
  })
  .refine((b) => b.name !== undefined || b.active !== undefined, { message: "nothing to update" });

export const PATCH = apiRoute("department:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const departmentId = BigInt(id);
  const existing = await tenantDb.departments.findUnique({ where: { id: departmentId } });
  if (!existing) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);
  const department = await tenantDb.departments.update({
    where: { id: departmentId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      updated_by: BigInt(ctx.session.userId),
    },
  });
  emitToTenant(ctx.session.tenantId, "department:updated", { department });
  return json({ department });
});
