import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export const DELETE = apiRoute("staff:manage", async (_request, ctx) => {
  const { id } = await ctx.params;
  const shiftId = BigInt(id);

  const existing = await tenantDb.duty_shifts.findUnique({ where: { id: shiftId } });
  if (!existing) return json({ error: "not_found" }, 404);

  await tenantDb.duty_shifts.delete({ where: { id: shiftId } });
  emitToTenant(ctx.session.tenantId, "dutyshift:deleted", { shiftId: Number(shiftId) });
  return json({ ok: true });
});
