import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const schema = z.object({
  stockId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  reason: z.enum(["EXPIRED", "DAMAGED", "WRONG_MEDICINE", "WRONG_BATCH", "OTHER"]),
  notes: z.string().trim().max(255).optional().or(z.literal("")),
});

// Stock going back to the supplier — decreases the batch, and the return
// itself is the record (never a silent quantity edit).
export const POST = apiRoute("return:create", async (request, { session }) => {
  const body = await parseBody(request, schema);
  const tid = requireTenantId();
  const uid = BigInt(session.userId);

  const result = await tenantDb.$transaction(async (tx) => {
    const [stock] = await tx.$queryRawUnsafe(`SELECT * FROM pharmacy_stock WHERE id = ? AND tenant_id = ? FOR UPDATE`, BigInt(body.stockId), BigInt(tid));
    if (!stock) throw new HttpError(404, "batch_not_found");
    if (stock.quantity < body.quantity) throw new HttpError(400, "insufficient_stock");

    await tx.pharmacy_stock.update({ where: { id: stock.id }, data: { quantity: { decrement: body.quantity } } });

    const ret = await tx.supplier_returns.create({
      data: {
        stock_id: stock.id,
        medicine_id: stock.medicine_id,
        supplier_id: stock.supplier_id,
        quantity: body.quantity,
        reason: body.reason,
        notes: body.notes || null,
        created_by: uid,
      },
    });

    await tx.pharmacy_stock_movements.create({
      data: { stock_id: stock.id, type: "SUPPLIER_RETURN", quantity_delta: -body.quantity, reason: `${body.reason}${body.notes ? ` — ${body.notes}` : ""}`, performed_by: uid, reference_type: "SUPPLIER_RETURN", reference_id: ret.id },
    });

    return ret;
  });

  emitToModule(session.tenantId, "PHARMACY", "stock:updated", { returnId: Number(result.id) });
  return json({ returnId: Number(result.id) }, 201);
});

export const GET = apiRoute("return:read", async () => {
  const rows = await tenantDb.supplier_returns.findMany({ orderBy: { created_at: "desc" }, take: 50 });
  return json({ returns: rows.map((r) => ({ id: Number(r.id), quantity: r.quantity, reason: r.reason, notes: r.notes, createdAt: r.created_at })) });
});
