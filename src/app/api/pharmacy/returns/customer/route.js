import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { recomputeBillStatus } from "@/lib/billing";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const schema = z.object({
  billItemId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(1).max(255),
  refund: z.coerce.boolean().optional().default(true),
});

// A sold pharmacy item coming back — verified against the ORIGINAL sale
// (the bill_item's own stock/batch/quantity snapshot from Phase 6/pharmacy
// billing), never a bare "add stock back" with no real transaction behind
// it. Stock goes back to the SAME batch it came from; money comes back
// through the existing refunds system (never a second payment engine).
export const POST = apiRoute("return:create", async (request, { session }) => {
  const body = await parseBody(request, schema);
  const tid = requireTenantId();
  const uid = BigInt(session.userId);

  const result = await tenantDb.$transaction(async (tx) => {
    const [item] = await tx.$queryRawUnsafe(
      `SELECT bi.*, b.tenant_id AS bill_tenant_id FROM bill_items bi JOIN bills b ON b.id = bi.bill_id WHERE bi.id = ? AND b.tenant_id = ? FOR UPDATE`,
      BigInt(body.billItemId),
      BigInt(tid),
    );
    if (!item || (item.source !== "SERVICE" && item.source !== "PHARMACY")) throw new HttpError(404, "bill_item_not_found");
    if (!item.stock_id) throw new HttpError(400, "not_a_pharmacy_sale_line");

    const alreadyReturned = await tx.customer_returns.aggregate({
      _sum: { quantity: true },
      where: { bill_item_id: BigInt(body.billItemId) },
    });
    const soldQty = Number(item.quantity || 1);
    const returnedSoFar = alreadyReturned._sum.quantity || 0;
    if (returnedSoFar + body.quantity > soldQty) throw new HttpError(400, "return_quantity_exceeds_sold");

    const stock = await tx.pharmacy_stock.findUnique({ where: { id: item.stock_id } });
    if (!stock) throw new HttpError(404, "batch_not_found");

    await tx.pharmacy_stock.update({ where: { id: stock.id }, data: { quantity: { increment: body.quantity } } });

    const unitPrice = item.unit_price != null ? Number(item.unit_price) : Number(item.amount) / soldQty;
    const refundAmount = Math.round(unitPrice * body.quantity * 100) / 100;

    let refundId = null;
    if (body.refund && refundAmount > 0) {
      const refund = await tx.refunds.create({
        data: { bill_id: item.bill_id, amount: refundAmount, reason: `Customer return: ${body.reason}`, authorized_by: uid },
      });
      refundId = refund.id;
      await recomputeBillStatus(tx, item.bill_id);
    }

    const ret = await tx.customer_returns.create({
      data: {
        bill_id: item.bill_id,
        bill_item_id: BigInt(body.billItemId),
        stock_id: stock.id,
        medicine_id: stock.medicine_id,
        quantity: body.quantity,
        reason: body.reason,
        refund_amount: body.refund ? refundAmount : 0,
        refund_id: refundId,
        created_by: uid,
      },
    });

    await tx.pharmacy_stock_movements.create({
      data: { stock_id: stock.id, type: "CUSTOMER_RETURN", quantity_delta: body.quantity, reason: body.reason, performed_by: uid, reference_type: "CUSTOMER_RETURN", reference_id: ret.id },
    });

    return { ret, billId: item.bill_id };
  });

  emitToModule(session.tenantId, "PHARMACY", "stock:updated", { returnId: Number(result.ret.id) });
  emitToModule(session.tenantId, "BILLING", "bill:updated", { billId: Number(result.billId) });
  return json({ returnId: Number(result.ret.id) }, 201);
});

export const GET = apiRoute("return:read", async () => {
  const rows = await tenantDb.customer_returns.findMany({ orderBy: { created_at: "desc" }, take: 50 });
  return json({
    returns: rows.map((r) => ({
      id: Number(r.id), billId: r.bill_id ? Number(r.bill_id) : null, quantity: r.quantity, reason: r.reason,
      refundAmount: Number(r.refund_amount), createdAt: r.created_at,
    })),
  });
});
