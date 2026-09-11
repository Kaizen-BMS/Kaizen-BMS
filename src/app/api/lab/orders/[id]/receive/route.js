import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { findById, updateById, scopedQueryOne } from "@/lib/repo/tenant";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Stage 2 of 3: sample received at the lab bench.
export const POST = apiRoute("lab:receive", async (_request, ctx) => {
  const { id } = await ctx.params;
  const orderId = Number(id);
  const order = await findById("lab_orders", orderId, "id, collected_at, received_at");
  if (!order) return json({ error: "not_found" }, 404);
  if (!order.collected_at) throw new HttpError(400, "not_collected_yet");
  if (order.received_at) throw new HttpError(400, "already_received");

  await updateById("lab_orders", orderId, { received_at: new Date() });

  const labOrder = await scopedQueryOne("SELECT * FROM lab_orders WHERE tenant_id = :tid AND id = :id", {
    id: orderId,
  });
  emitToModule(ctx.session.tenantId, "LAB", "laborder:updated", { labOrder });
  return json({ labOrder });
});
