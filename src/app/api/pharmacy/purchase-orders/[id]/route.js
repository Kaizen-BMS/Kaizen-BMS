import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const ALLOWED = { DRAFT: ["SENT", "CANCELLED"], SENT: ["CANCELLED"], PARTIALLY_RECEIVED: ["CANCELLED"], RECEIVED: [], CANCELLED: [] };
const schema = z.object({ status: z.enum(["DRAFT", "SENT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]) });

// Cancel/re-send a PO. RECEIVED/PARTIALLY_RECEIVED are set automatically by
// the GRN route as stock actually arrives — never set directly here.
export const PATCH = apiRoute("po:manage", async (request, { session, params }) => {
  const { id } = await params;
  const po = await tenantDb.purchase_orders.findUnique({ where: { id: BigInt(id) } });
  if (!po) return json({ error: "not_found" }, 404);
  const body = await parseBody(request, schema);
  if (!ALLOWED[po.status]?.includes(body.status)) throw new HttpError(409, "invalid_transition");
  const updated = await tenantDb.purchase_orders.update({ where: { id: po.id }, data: { status: body.status } });
  emitToModule(session.tenantId, "PHARMACY", "po:updated", { purchaseOrderId: Number(updated.id) });
  return json({ status: updated.status });
});
