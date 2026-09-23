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
  amount: z.coerce.number().positive().max(10_000_000).optional(), // blank = whatever is still due
  idempotencyKey: z.string().trim().min(1).max(64).optional(),
});

// Take payment for a pharmacy sale — same reasoning as
// GET /api/pharmacy/sales/[billId]: a solo pharmacy has no BILLING module
// to go through, so this is its own pharmacy-gated payment endpoint
// (mirrors POST /api/lab/orders/[id]/pay exactly). Reuses the same
// recomputeBillStatus()/idempotency-key discipline as every other payment
// route in this codebase — never a second payment engine.
export const POST = apiRoute("pharmacy:sell", async (request, { session, params }) => {
  const { billId } = await params;
  const b = await parseBody(request, schema);
  const bill = await tenantDb.bills.findUnique({ where: { id: BigInt(billId) }, select: { id: true } });
  if (!bill) throw new HttpError(404, "not_found");
  const info = (await billInfo([bill.id])).get(String(bill.id));
  if (!info || info.due <= 0) throw new HttpError(400, "already_paid");
  const amount = Math.min(b.amount ?? info.due, info.due);

  if (b.idempotencyKey && (await tenantDb.payments.findFirst({ where: { bill_id: bill.id, idempotency_key: b.idempotencyKey } }))) {
    return json({ bill: (await billInfo([bill.id])).get(String(bill.id)) });
  }
  await tenantDb.$transaction(async (tx) => {
    const payment = await tx.payments.create({
      data: { bill_id: bill.id, amount, mode: b.mode, recorded_by: BigInt(session.userId), idempotency_key: b.idempotencyKey || null },
    });
    await recomputeBillStatus(tx, bill.id);
    await writeOutboxEvent(tx, {
      tenantId: session.tenantId, eventType: "PaymentReceived", aggregateType: "Payment", aggregateId: payment.id,
      payload: { paymentId: Number(payment.id), billId: Number(bill.id), amount, mode: b.mode, recordedBy: session.userId },
    });
  });
  const result = (await billInfo([bill.id])).get(String(bill.id));
  emitToModule(session.tenantId, "BILLING", "bill:paid", { bill: result });
  emitToModule(session.tenantId, "PHARMACY", "stock:updated", { billId: Number(bill.id) });
  return json({ bill: result }, 201);
});
