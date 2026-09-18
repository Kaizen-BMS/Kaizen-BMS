import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { serializeOrder, attachDoctorNames } from "@/lib/radiology";

export const dynamic = "force-dynamic";

export const GET = apiRoute("radiology:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const row = await tenantDb.radiology_orders.findUnique({
    where: { id: BigInt(id) },
    include: { patients: { select: { name: true } } },
  });
  if (!row) return json({ error: "not_found" }, 404);
  const [radiologyOrder] = await attachDoctorNames(tenantDb, ctx.session.tenantId, [serializeOrder(row)]);
  return json({ radiologyOrder });
});
