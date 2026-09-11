import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Stage 2 of 3: sample received at the lab bench.
export const POST = apiRoute("lab:receive", async (_request, ctx) => {
  const { id } = await ctx.params;
  const orderId = BigInt(id);
  const order = await tenantDb.lab_orders.findUnique({
    where: { id: orderId },
    select: { id: true, collected_at: true, received_at: true },
  });
  if (!order) return json({ error: "not_found" }, 404);
  if (!order.collected_at) throw new HttpError(400, "not_collected_yet");
  if (order.received_at) throw new HttpError(400, "already_received");

  const labOrder = await tenantDb.lab_orders.update({
    where: { id: orderId },
    data: { received_at: new Date() },
  });
  emitToModule(ctx.session.tenantId, "LAB", "laborder:updated", { labOrder });
  return json({ labOrder });
});
