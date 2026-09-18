import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";
import { cancelSchema, serializeOrder, TERMINAL_STATUSES } from "@/lib/radiology";

export const dynamic = "force-dynamic";

export const PATCH = apiRoute("radiology:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const orderId = BigInt(id);
  const order = await tenantDb.radiology_orders.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) return json({ error: "not_found" }, 404);
  if (TERMINAL_STATUSES.has(order.status)) throw new HttpError(409, "order_already_finalized");

  const body = await parseBody(request, cancelSchema);
  const updated = await tenantDb.radiology_orders.update({
    where: { id: orderId },
    data: { status: "CANCELLED", cancelled_at: new Date(), cancel_reason: body.reason },
    include: { patients: { select: { name: true } } },
  });
  const radiologyOrder = serializeOrder(updated);

  emitToModule(ctx.session.tenantId, "RADIOLOGY", "radiologyorder:updated", { radiologyOrder });
  return json({ radiologyOrder });
});
