import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";
import { serviceUpdateSchema, serializeService } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export const PATCH = apiRoute("service:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const serviceId = BigInt(id);

  const existing = await tenantDb.services.findUnique({ where: { id: serviceId } });
  if (!existing) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, serviceUpdateSchema);

  if (body.code && body.code !== existing.code) {
    const clash = await tenantDb.services.findFirst({ where: { code: body.code, NOT: { id: serviceId } } });
    if (clash) throw new HttpError(409, "code_already_in_use");
  }

  const updated = await tenantDb.services.update({
    where: { id: serviceId },
    data: {
      ...(body.code !== undefined ? { code: body.code } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
      ...(body.category !== undefined ? { category: body.category || null } : {}),
      ...(body.serviceType !== undefined ? { service_type: body.serviceType } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      updated_by: BigInt(ctx.session.userId),
    },
  });

  emitToModule(ctx.session.tenantId, "BILLING", "service:updated", { service: serializeService(updated) });
  return json({ service: serializeService(updated) });
});
