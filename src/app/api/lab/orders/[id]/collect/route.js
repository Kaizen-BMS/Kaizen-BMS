import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { findById, updateById, scopedQueryOne } from "@/lib/repo/tenant";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Stage 1 of 3: sample collected from the patient.
export const POST = apiRoute("lab:collect", async (_request, ctx) => {
  const { id } = await ctx.params;
  const orderId = Number(id);
  const order = await findById("lab_orders", orderId, "id, status, collected_at");
  if (!order) return json({ error: "not_found" }, 404);
  if (order.collected_at) throw new HttpError(400, "already_collected");

  await updateById("lab_orders", orderId, {
    collected_at: new Date(),
    status: order.status === "ORDERED" ? "IN_PROGRESS" : order.status,
  });

  const labOrder = await scopedQueryOne("SELECT * FROM lab_orders WHERE tenant_id = :tid AND id = :id", {
    id: orderId,
  });
  emitToModule(ctx.session.tenantId, "LAB", "laborder:updated", { labOrder });
  return json({ labOrder });
});
