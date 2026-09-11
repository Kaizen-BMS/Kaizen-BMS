import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  amount: z.coerce.number().min(0).max(10_000_000),
});

// Pharmacy/lab line items are auto-added with amount 0 (no price catalog in
// this system — see CLAUDE.md "Billing module"); billing staff price them
// here before checkout. Blocked once the bill is finalized.
export const PATCH = apiRoute("bill:update", async (request, ctx) => {
  const { id, itemId } = await ctx.params;
  const billId = BigInt(id);

  const bill = await tenantDb.bills.findUnique({ where: { id: billId }, select: { id: true, finalized_at: true } });
  if (!bill) return json({ error: "not_found" }, 404);
  if (bill.finalized_at) throw new HttpError(400, "bill_finalized");

  const item = await tenantDb.bill_items.findFirst({ where: { id: BigInt(itemId), bill_id: billId } });
  if (!item) return json({ error: "item_not_found" }, 404);

  const body = await parseBody(request, patchSchema);

  const result = await tenantDb.$transaction(async (tx) => {
    await tx.bill_items.update({ where: { id: item.id }, data: { amount: body.amount } });
    await recomputeBillStatus(tx, billId);
    return tx.bills.findUnique({ where: { id: billId }, include: { bill_items: true } });
  });

  emitToModule(ctx.session.tenantId, "BILLING", "bill:updated", { bill: result });
  return json({ bill: result });
});
