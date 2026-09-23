import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    floor: z.string().trim().max(50).optional().or(z.literal("")),
    active: z.coerce.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });

export const PATCH = apiRoute("ward:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const wardId = BigInt(id);
  const existing = await tenantDb.wards.findUnique({ where: { id: wardId } });
  if (!existing) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);

  if (body.active === false) {
    const bedCount = await tenantDb.beds.count({ where: { ward_type: existing.code } });
    if (bedCount > 0) throw new HttpError(409, "ward_has_beds");
  }

  const ward = await tenantDb.wards.update({
    where: { id: wardId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.floor !== undefined ? { floor: body.floor || null } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.displayOrder !== undefined ? { display_order: body.displayOrder } : {}),
    },
  });
  emitToModule(ctx.session.tenantId, "IPD", "ward:updated", { ward });
  return json({ ward });
});
