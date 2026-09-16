import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";
import { writeOutboxEvent } from "@/lib/outbox";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000),
  mode: z.enum(["CASH", "CARD", "UPI"]),
  // The client generates this once per "record payment" click and resends
  // the SAME value if it has to retry after a network error/timeout — see
  // CLAUDE.md "Billing module" for why this matters on this remote DB.
  idempotencyKey: z.string().trim().min(1).max(64).optional(),
});

// Multiple payments per bill are allowed (partial payment) — never required
// to be the full outstanding amount in one go.
export const POST = apiRoute("bill:update", async (request, ctx) => {
  const { id } = await ctx.params;
  const billId = BigInt(id);

  const bill = await tenantDb.bills.findUnique({ where: { id: billId }, select: { id: true, status: true } });
  if (!bill) return json({ error: "not_found" }, 404);
  if (bill.status === "PAID") throw new HttpError(400, "already_paid");

  const body = await parseBody(request, createSchema);

  if (body.idempotencyKey) {
    const already = await tenantDb.payments.findFirst({
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
    const payment = await tx.payments.create({
      data: {
        bill_id: billId,
        amount: body.amount,
        mode: body.mode,
        recorded_by: BigInt(ctx.session.userId),
        idempotency_key: body.idempotencyKey || null,
      },
    });
    await recomputeBillStatus(tx, billId);
    // Durable event, same transaction as the payment write — see CLAUDE.md
    // "Outbox — durable domain events". Separate concern from the
    // idempotencyKey above: that protects against a client double-
    // submitting the same "record payment" click; this is the durable
    // record of the fact itself, for a future durable consumer. Not the
    // realtime emit — emitToModule("bill:paid") below stays untouched.
    await writeOutboxEvent(tx, {
      tenantId: ctx.session.tenantId,
      eventType: "PaymentReceived",
      aggregateType: "Payment",
      aggregateId: payment.id,
      payload: {
        paymentId: Number(payment.id),
        billId: Number(billId),
        amount: body.amount,
        mode: body.mode,
        recordedBy: ctx.session.userId,
      },
    });
    return tx.bills.findUnique({
      where: { id: billId },
      include: { bill_items: true, payments: true, discounts: true, refunds: true },
    });
  });

  emitToModule(ctx.session.tenantId, "BILLING", "bill:paid", { bill: result });
  return json({ bill: result }, 201);
});
