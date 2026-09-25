import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { resolveInstance } from "@/lib/moduleInstances";
import { recomputeBillStatus } from "@/lib/billing";
import { sellItems } from "@/lib/pharmacySale";
import { billInfo } from "@/lib/labBills";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const schema = z.object({
  items: z.array(z.object({ medicineId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(100_000) })).min(1).max(50),
  moduleInstanceId: z.coerce.number().int().positive().optional(),
});

// Add more medicines to a customer's still-open counter sale — the "running / combined bill" case
// (CLAUDE.md pharmacy §9): 10 AM medicine A, 2 PM medicine B, one bill, one payment at the end.
// Each addition remains its own traceable stock movement + priced line with its own timestamp
// (bill_items.created_at) — this never re-prices or touches an earlier line, only appends new ones.
// A finalized or already-fully-paid bill can't be reopened by adding to it — start a new sale instead.
export const POST = apiRoute("pharmacy:sell", async (request, ctx) => {
  const { billId } = await ctx.params;
  const body = await parseBody(request, schema);
  const tid = requireTenantId();
  const uid = BigInt(ctx.session.userId);

  const bill = await tenantDb.bills.findFirst({ where: { id: BigInt(billId), visit_id: null, bill_type: "OPD" } });
  if (!bill) return json({ error: "not_found" }, 404);
  if (bill.finalized_at) throw new HttpError(409, "bill_finalized");

  const instance = await resolveInstance(tenantDb, tid, "PHARMACY", body.moduleInstanceId);
  await tenantDb.$transaction(async (tx) => {
    await sellItems(tx, { tenantId: tid, instanceId: instance.id, billId: bill.id, items: body.items, performedBy: uid });
    await recomputeBillStatus(tx, bill.id);
  });

  const result = (await billInfo([bill.id])).get(String(bill.id));
  emitToModule(ctx.session.tenantId, "BILLING", "bill:updated", { bill: result });
  emitToModule(ctx.session.tenantId, "PHARMACY", "stock:updated", { billId: Number(bill.id) });
  return json({ bill: result }, 201);
});
