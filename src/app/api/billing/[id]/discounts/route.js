import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Never anonymous — always a reason and a named approver (the recording
// user; there's no separate "authorize as someone else" flow, so the
// approver IS whoever is logged in recording it — audit-relevant).
const createSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(1).max(64).optional(),
});

export const POST = apiRoute("bill:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const billId = BigInt(id);

  const bill = await tenantDb.bills.findUnique({ where: { id: billId }, select: { id: true } });
  if (!bill) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, createSchema);

  if (body.idempotencyKey) {
    const already = await tenantDb.discounts.findFirst({
      where: { bill_id: billId, idempotency_key: body.idempotencyKey },
    });
    if (already) {
      const existingBill = await tenantDb.bills.findUnique({
        where: { id: billId },
        include: { bill_items: true, payments: true, discounts: true, refunds: true },
      });
      return json({ bill: existingBill }, 200);
    }
  }

  const result = await tenantDb.$transaction(async (tx) => {
    await tx.discounts.create({
      data: {
        bill_id: billId,
        amount: body.amount,
        reason: body.reason,
        authorized_by: BigInt(ctx.session.userId),
        idempotency_key: body.idempotencyKey || null,
      },
    });
    await recomputeBillStatus(tx, billId);
    return tx.bills.findUnique({
      where: { id: billId },
      include: { bill_items: true, payments: true, discounts: true, refunds: true },
    });
  });

  emitToModule(ctx.session.tenantId, "BILLING", "bill:updated", { bill: result });
  return json({ bill: result }, 201);
});
