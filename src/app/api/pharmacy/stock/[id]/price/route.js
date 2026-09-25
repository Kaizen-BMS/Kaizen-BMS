import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const priceSchema = z.object({
  mrp: z.coerce.number().min(0).max(1_000_000),
  sellingRate: z.coerce.number().min(0).max(1_000_000),
  // A price revision usually covers the whole stock of a medicine, not one batch.
  applyToMedicine: z.boolean().optional().default(false),
});

// Change the MRP / selling price of stock already on the shelf (a price hike, a new MRP printed on
// fresh packs, a discount). Purchase rate is history and is not touched. Every change is written to
// the stock ledger as a zero-quantity entry, so who changed a price and from what is never lost.
export const PATCH = apiRoute("stock:adjust", async (request, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(request, priceSchema);
  if (body.sellingRate > body.mrp) throw new HttpError(400, "selling_price_above_mrp");

  const batch = await tenantDb.pharmacy_stock.findUnique({ where: { id: BigInt(id) } });
  if (!batch) return json({ error: "not_found" }, 404);

  const targets = body.applyToMedicine
    ? await tenantDb.pharmacy_stock.findMany({
        where: {
          module_instance_id: batch.module_instance_id,
          ...(batch.medicine_id ? { medicine_id: batch.medicine_id } : { medicine_name: batch.medicine_name }),
        },
      })
    : [batch];

  const fmt = (n) => (n == null ? "none" : `₹${Number(n)}`);
  await tenantDb.$transaction(async (tx) => {
    for (const t of targets) {
      await tx.pharmacy_stock.update({ where: { id: t.id }, data: { mrp: body.mrp, selling_rate: body.sellingRate } });
      await tx.pharmacy_stock_movements.create({
        data: {
          stock_id: t.id,
          type: "ADJUSTMENT",
          quantity_delta: 0,
          reason: `Price changed: MRP ${fmt(t.mrp)} → ${fmt(body.mrp)}, selling ${fmt(t.selling_rate)} → ${fmt(body.sellingRate)}${body.applyToMedicine ? " (all batches)" : ""}`,
          performed_by: BigInt(ctx.session.userId),
        },
      });
    }
  });

  emitToModule(ctx.session.tenantId, "PHARMACY", "stock:updated", { batch: { id: batch.id } });
  return json({ updated: targets.length });
});
