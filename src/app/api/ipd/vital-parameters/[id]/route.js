import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const numberRange = z
  .object({ min: z.coerce.number(), max: z.coerce.number() })
  .refine((r) => r.min <= r.max, { message: "min must be <= max" });

const patchSchema = z
  .object({
    label: z.string().trim().min(1).max(100).optional(),
    unit: z.string().trim().max(30).optional().or(z.literal("")),
    range: z.union([numberRange, z.object({ systolic: numberRange, diastolic: numberRange }), z.null()]).optional(),
    active: z.coerce.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });

export const PATCH = apiRoute("vitalparam:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const paramId = BigInt(id);
  const existing = await tenantDb.vital_parameters.findUnique({ where: { id: paramId } });
  if (!existing) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);
  const vitalParameter = await tenantDb.vital_parameters.update({
    where: { id: paramId },
    data: {
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.unit !== undefined ? { unit: body.unit || null } : {}),
      ...(body.range !== undefined && existing.value_type !== "TEXT"
        ? { range_config: JSON.stringify(body.range) }
        : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.displayOrder !== undefined ? { display_order: body.displayOrder } : {}),
    },
  });
  const shaped = { ...vitalParameter, range_config: vitalParameter.range_config ? JSON.parse(vitalParameter.range_config) : null };
  emitToTenant(ctx.session.tenantId, "vitalparam:updated", { vitalParameter: shaped });
  return json({ vitalParameter: shaped });
});
