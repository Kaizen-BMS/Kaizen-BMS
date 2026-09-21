import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";
import { writeOutboxEvent } from "@/lib/outbox";
import { billInfo } from "@/lib/labBills";

export const dynamic = "force-dynamic";

const schema = z.object({
  mode: z.enum(["CASH", "CARD", "UPI"]),
  amount: z.coerce.number().positive().max(10_000_000).optional(), // blank = the whole amount still due
  idempotencyKey: z.string().trim().min(1).max(64).optional(),
});

// The lab counter takes the money for its own walk-in bill, right here.
export const POST = apiRoute("lab:walkin", async (request, { session, params }) => {
  const { id } = await params;
  const b = await parseBody(request, schema);
  const order = await tenantDb.lab_orders.findUnique({ where: { id: BigInt(id) }, select: { bill_id: true } });
  if (!order?.bill_id) throw new HttpError(404, "no_bill_for_order");
  const info = (await billInfo([order.bill_id])).get(String(order.bill_id));
  if (!info || info.due <= 0) throw new HttpError(400, "already_paid");
  const amount = Math.min(b.amount ?? info.due, info.due);

  if (b.idempotencyKey && (await tenantDb.payments.findFirst({ where: { bill_id: order.bill_id, idempotency_key: b.idempotencyKey } }))) {
    return json({ bill: (await billInfo([order.bill_id])).get(String(order.bill_id)) });
  }
  await tenantDb.$transaction(async (tx) => {
    const payment = await tx.payments.create({
      data: { bill_id: order.bill_id, amount, mode: b.mode, recorded_by: BigInt(session.userId), idempotency_key: b.idempotencyKey || null },
    });
    await recomputeBillStatus(tx, order.bill_id);
    await writeOutboxEvent(tx, {
      tenantId: session.tenantId, eventType: "PaymentReceived", aggregateType: "Payment", aggregateId: payment.id,
      payload: { paymentId: Number(payment.id), billId: Number(order.bill_id), amount, mode: b.mode, recordedBy: session.userId },
    });
  });
  const bill = (await billInfo([order.bill_id])).get(String(order.bill_id));
  emitToModule(session.tenantId, "BILLING", "bill:paid", { bill });
  return json({ bill }, 201);
});
