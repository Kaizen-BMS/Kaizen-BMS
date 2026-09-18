import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { sendLabOrderExternal } from "@/lib/externalLab";

export const dynamic = "force-dynamic";

// Doctor orders -> internal/external selection (this task's "B" — External
// Lab Integration). Internal lab ordering (POST /api/lab/orders, wherever
// it lives) is completely untouched — this is the alternate path a lab
// order can take, same "purely additive" shape Phase 8C established for
// checkContractAccess()'s first real consumer.
const bodySchema = z.object({
  providerId: z.coerce.number().int().positive().optional(),
});

export const POST = apiRoute("laborder:create", async (request, { session, params }) => {
  const { id } = await params;
  const body = await parseBody(request, bodySchema);
  const result = await sendLabOrderExternal({ labOrderId: id, providerId: body.providerId, actorUserId: session.userId });
  return json({
    externalOrder: {
      id: Number(result.externalOrder.id),
      status: result.externalOrder.status,
      externalOrderRef: result.externalOrder.external_order_ref,
    },
    alreadySent: result.alreadySent,
  });
});
