import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(""));
const detailsSchema = z
  .object({
    batchNumber: z.string().trim().min(1).max(191).optional(),
    manufacturingDate: isoDate,
    expiryDate: isoDate,
    purchaseRate: z.coerce.number().min(0).max(1_000_000).optional(),
    rack: z.string().trim().max(60).optional().or(z.literal("")),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });

// Correct a mistake on a batch already entered (wrong batch number, a typo
// in the expiry/MFD, a purchase rate keyed in wrong, the shelf location) —
// distinct from stock:adjust's quantity delta and price/route.js's MRP/
// selling change, both of which already had their own edit path; these
// core batch-identity fields had none at all. Same audited shape as price
// changes: every field actually changed is logged as a zero-quantity
// pharmacy_stock_movements entry, old value -> new, never a silent edit.
export const PATCH = apiRoute("stock:adjust", async (request, ctx) => {
  const { id } = await ctx.params;
  const stockId = BigInt(id);
  const batch = await tenantDb.pharmacy_stock.findUnique({ where: { id: stockId } });
  if (!batch) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, detailsSchema);
  const data = {};
  const changes = [];
  const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "none");

  if (body.batchNumber !== undefined && body.batchNumber !== (batch.batch_number || "")) {
    data.batch_number = body.batchNumber;
    changes.push(`batch no. ${batch.batch_number || "none"} → ${body.batchNumber}`);
  }
  if (body.manufacturingDate !== undefined) {
    const v = body.manufacturingDate ? new Date(body.manufacturingDate) : null;
    if (fmtDate(batch.manufacturing_date) !== fmtDate(v)) {
      data.manufacturing_date = v;
      changes.push(`MFD ${fmtDate(batch.manufacturing_date)} → ${fmtDate(v)}`);
    }
  }
  if (body.expiryDate !== undefined) {
    const v = body.expiryDate ? new Date(body.expiryDate) : null;
    if (fmtDate(batch.expiry_date) !== fmtDate(v)) {
      data.expiry_date = v;
      changes.push(`expiry ${fmtDate(batch.expiry_date)} → ${fmtDate(v)}`);
    }
  }
  if (body.purchaseRate !== undefined && Number(body.purchaseRate) !== Number(batch.purchase_rate ?? 0)) {
    data.purchase_rate = body.purchaseRate;
    changes.push(`purchase rate ₹${batch.purchase_rate ?? 0} → ₹${body.purchaseRate}`);
  }
  if (body.rack !== undefined && body.rack !== (batch.rack || "")) {
    data.rack = body.rack || null;
    changes.push(`location ${batch.rack || "none"} → ${body.rack || "none"}`);
  }

  if (changes.length === 0) return json({ batch });

  try {
    await tenantDb.$transaction(async (tx) => {
      await tx.pharmacy_stock.update({ where: { id: stockId }, data });
      await tx.pharmacy_stock_movements.create({
        data: {
          stock_id: stockId,
          type: "ADJUSTMENT",
          quantity_delta: 0,
          reason: `Batch details corrected: ${changes.join("; ")}`,
          performed_by: BigInt(ctx.session.userId),
        },
      });
    });
  } catch (err) {
    if (err.code === "P2002") throw new HttpError(409, "batch_number_taken");
    throw err;
  }

  const updated = await tenantDb.pharmacy_stock.findUnique({ where: { id: stockId } });
  emitToModule(ctx.session.tenantId, "PHARMACY", "stock:updated", { batch: updated });
  return json({ batch: updated });
});
