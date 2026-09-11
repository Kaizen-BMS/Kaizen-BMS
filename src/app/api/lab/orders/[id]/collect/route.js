import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Stage 1 of 3: sample collected from the patient.
export const POST = apiRoute("lab:collect", async (_request, ctx) => {
  const { id } = await ctx.params;
  const orderId = BigInt(id);
  const order = await tenantDb.lab_orders.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, collected_at: true },
  });
  if (!order) return json({ error: "not_found" }, 404);
  if (order.collected_at) throw new HttpError(400, "already_collected");

  const labOrder = await tenantDb.lab_orders.update({
    where: { id: orderId },
    data: {
      collected_at: new Date(),
      status: order.status === "ORDERED" ? "IN_PROGRESS" : order.status,
    },
  });
  emitToModule(ctx.session.tenantId, "LAB", "laborder:updated", { labOrder });
  return json({ labOrder });
});
