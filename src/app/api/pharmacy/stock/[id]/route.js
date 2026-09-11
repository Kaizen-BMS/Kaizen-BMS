import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { transaction } from "@/lib/db";
import { findById, requireTenantId, scopedQueryOne } from "@/lib/repo/tenant";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  delta: z.coerce.number().int().refine((n) => n !== 0, "delta cannot be zero"),
  reason: z.string().trim().min(1).max(500),
});

// Manual stock correction (damaged, lost, recount, …) — always logged with
// who/when/why via pharmacy_stock_movements, never a silent quantity edit.
export const PATCH = apiRoute("stock:adjust", async (request, ctx) => {
  const { id } = await ctx.params;
  const stockId = Number(id);
  const batch = await findById("pharmacy_stock", stockId, "id, quantity");
  if (!batch) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);
  const newQuantity = batch.quantity + body.delta;
  if (newQuantity < 0) return json({ error: "quantity_cannot_go_negative" }, 400);

  const tid = requireTenantId();
  await transaction(async (conn) => {
    await conn.execute("UPDATE pharmacy_stock SET quantity = ? WHERE tenant_id = ? AND id = ?", [
      newQuantity,
      tid,
      stockId,
    ]);
    await conn.execute(
      `INSERT INTO pharmacy_stock_movements (tenant_id, stock_id, type, quantity_delta, reason, performed_by)
       VALUES (?, ?, 'ADJUSTMENT', ?, ?, ?)`,
      [tid, stockId, body.delta, body.reason, ctx.session.userId],
    );
  });

  const updated = await scopedQueryOne("SELECT * FROM pharmacy_stock WHERE tenant_id = :tid AND id = :id", {
    id: stockId,
  });
  emitToModule(ctx.session.tenantId, "PHARMACY", "stock:updated", { batch: updated });
  return json({ batch: updated });
});
