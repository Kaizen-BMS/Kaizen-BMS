import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Its own recorded action — never a silent negative Payment row.
// `paymentId` is optional: a refund can be tied to the specific payment it
// reverses, or recorded against the bill as a whole.
const createSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000),
  reason: z.string().trim().min(1).max(500),
  paymentId: z.coerce.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(1).max(64).optional(),
});

export const POST = apiRoute("bill:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const billId = BigInt(id);

  const bill = await tenantDb.bills.findUnique({ where: { id: billId }, select: { id: true } });
  if (!bill) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, createSchema);

  if (body.paymentId) {
    const payment = await tenantDb.payments.findFirst({
      where: { id: BigInt(body.paymentId), bill_id: billId },
    });
    if (!payment) throw new HttpError(400, "payment_not_found_on_this_bill");
  }

  if (body.idempotencyKey) {
    const already = await tenantDb.refunds.findFirst({
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
    await tx.refunds.create({
      data: {
        bill_id: billId,
        payment_id: body.paymentId ? BigInt(body.paymentId) : null,
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
