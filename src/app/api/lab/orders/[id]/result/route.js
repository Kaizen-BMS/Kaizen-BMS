import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { findById, updateById, scopedQueryOne } from "@/lib/repo/tenant";
import { emitToModule, emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const resultSchema = z.object({
  results: z
    .array(
      z.object({
        testName: z.string().trim().min(1).max(191),
        result: z.string().trim().min(1).max(191),
        units: z.string().trim().max(64).optional().or(z.literal("")),
        referenceRange: z.string().trim().max(191).optional().or(z.literal("")),
        flag: z.enum(["NORMAL", "HIGH", "LOW", "ABNORMAL"]).optional().default("NORMAL"),
      }),
    )
    .min(1),
});

// Stage 3 of 3: results entered, report finalized.
export const POST = apiRoute("lab:result", async (request, ctx) => {
  const { id } = await ctx.params;
  const orderId = Number(id);
  const order = await findById("lab_orders", orderId, "id, received_at, status");
  if (!order) return json({ error: "not_found" }, 404);
  if (!order.received_at) throw new HttpError(400, "not_received_yet");

  const body = await parseBody(request, resultSchema);

  await updateById("lab_orders", orderId, {
    results: JSON.stringify(body.results),
    status: "RESULTED",
    resulted_by: ctx.session.userId,
    resulted_at: new Date(),
  });

  const labOrder = await scopedQueryOne("SELECT * FROM lab_orders WHERE tenant_id = :tid AND id = :id", {
    id: orderId,
  });

  emitToModule(ctx.session.tenantId, "LAB", "laborder:updated", { labOrder });
  // Same event name the topbar's notification bell already listens for.
  emitToTenant(ctx.session.tenantId, "lab:result", { labOrder });

  return json({ labOrder });
});
