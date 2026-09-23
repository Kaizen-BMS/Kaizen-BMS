import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// A structured category on top of the free-text reason — DAMAGED / expired
// write-off get their own movement type (still visible in Reports/history
// as exactly what they were), everything else stays a plain ADJUSTMENT.
const CATEGORY_TYPE = { DAMAGED: "DAMAGED", EXPIRED_WRITEOFF: "EXPIRED_WRITEOFF", COUNT_CORRECTION: "ADJUSTMENT", OTHER: "ADJUSTMENT" };

const patchSchema = z.object({
  delta: z.coerce.number().int().refine((n) => n !== 0, "delta cannot be zero"),
  reason: z.string().trim().min(1).max(500),
  category: z.enum(["DAMAGED", "EXPIRED_WRITEOFF", "COUNT_CORRECTION", "OTHER"]).optional().default("OTHER"),
});

// Manual stock correction (damaged, lost, recount, …) — always logged with
// who/when/why via pharmacy_stock_movements, never a silent quantity edit.
export const PATCH = apiRoute("stock:adjust", async (request, ctx) => {
  const { id } = await ctx.params;
  const stockId = BigInt(id);
  const batch = await tenantDb.pharmacy_stock.findUnique({
    where: { id: stockId },
    select: { id: true, quantity: true },
  });
  if (!batch) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);
  const newQuantity = batch.quantity + body.delta;
  if (newQuantity < 0) return json({ error: "quantity_cannot_go_negative" }, 400);

  await tenantDb.$transaction(async (tx) => {
    await tx.pharmacy_stock.update({ where: { id: stockId }, data: { quantity: newQuantity } });
    await tx.pharmacy_stock_movements.create({
      data: {
        stock_id: stockId,
        type: CATEGORY_TYPE[body.category],
        quantity_delta: body.delta,
        reason: body.reason,
        performed_by: BigInt(ctx.session.userId),
      },
    });
  });

  const updated = await tenantDb.pharmacy_stock.findUnique({ where: { id: stockId } });
  emitToModule(ctx.session.tenantId, "PHARMACY", "stock:updated", { batch: updated });
  return json({ batch: updated });
});
