import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { sendLabOrderExternal } from "@/lib/externalLab";
import { sendPrescriptionItemExternal } from "@/lib/externalPharmacy";

export const dynamic = "force-dynamic";

/**
 * Retry a FAILED outbound ExternalOrder (this task's "F" — safe failure
 * states + retry). FAILED is deliberately not in externalOrders.js's
 * TERMINAL_STATUSES set for exactly this reason — a failed send can be
 * retried; COMPLETED/CANCELLED cannot. Resets to PENDING then re-runs the
 * same orchestration function the original send used, so this is never a
 * second retry code path to drift from the first attempt's logic.
 */
export const POST = apiRoute("external:manage", async (request, { session, params }) => {
  const { id } = await params;
  const order = await tenantDb.external_orders.findUnique({ where: { id: BigInt(id) } });
  if (!order) throw new HttpError(404, "external_order_not_found");
  if (order.status !== "FAILED") throw new HttpError(409, "only_failed_orders_can_be_retried");

  await tenantDb.external_orders.update({ where: { id: order.id }, data: { status: "PENDING" } });

  let result;
  if (order.order_type === "LAB_ORDER") {
    result = await sendLabOrderExternal({ labOrderId: order.internal_reference_id, providerId: order.provider_id, actorUserId: session.userId });
  } else if (order.order_type === "PHARMACY_PRESCRIPTION") {
    result = await sendPrescriptionItemExternal({ prescriptionItemId: order.internal_reference_id, providerId: order.provider_id, actorUserId: session.userId });
  } else {
    throw new HttpError(409, "unsupported_order_type");
  }

  return json({
    externalOrder: {
      id: Number(result.externalOrder.id),
      status: result.externalOrder.status,
      externalOrderRef: result.externalOrder.external_order_ref,
    },
  });
});
