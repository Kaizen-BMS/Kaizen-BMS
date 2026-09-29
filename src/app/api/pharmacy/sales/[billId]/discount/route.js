import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";
import { billInfo } from "@/lib/labBills";

export const dynamic = "force-dynamic";

// Never anonymous — same rule as every discount in this product (CLAUDE.md
// Billing module): a reason and a named approver, the recording user.
const schema = z.object({
  amount: z.coerce.number().positive().max(10_000_000),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(1).max(64).optional(),
});

// A pharmacy-gated discount for a counter sale — same reasoning as
// POST /api/pharmacy/sales/[billId]/pay: a solo pharmacy (and a
// PHARMACIST in a hospital) has no BILLING module/`bill:update` to reach
// the general POST /api/billing/[id]/discounts, so pharmacy billing needs
// its own gate onto the exact same `discounts` table/recomputeBillStatus()
// — never a second discount engine.
export const POST = apiRoute("pharmacy:sell", async (request, { session, params }) => {
  const { billId } = await params;
  const body = await parseBody(request, schema);
  const bill = await tenantDb.bills.findUnique({ where: { id: BigInt(billId) }, select: { id: true, finalized_at: true } });
  if (!bill) throw new HttpError(404, "not_found");

  if (body.idempotencyKey && (await tenantDb.discounts.findFirst({ where: { bill_id: bill.id, idempotency_key: body.idempotencyKey } }))) {
    return json({ bill: (await billInfo([bill.id])).get(String(bill.id)) });
  }

  await tenantDb.$transaction(async (tx) => {
    await tx.discounts.create({
      data: { bill_id: bill.id, amount: body.amount, reason: body.reason, authorized_by: BigInt(session.userId), idempotency_key: body.idempotencyKey || null },
    });
    await recomputeBillStatus(tx, bill.id);
  });

  const result = (await billInfo([bill.id])).get(String(bill.id));
  emitToModule(session.tenantId, "BILLING", "bill:updated", { bill: result });
  return json({ bill: result }, 201);
});
