import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const schema = z.object({
  stockId: z.coerce.number().int().positive(),
  toInstanceId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  reason: z.string().trim().max(255).optional().or(z.literal("")),
});

// Move stock from one Pharmacy instance to another (e.g. Main -> Emergency).
// Decrements the source batch, creates/increments a matching batch at the
// destination, and records both halves as one traceable transfer — never a
// silent decrement-here/increment-there with no link between them.
export const POST = apiRoute("stocktransfer:create", async (request, { session }) => {
  const body = await parseBody(request, schema);
  const uid = BigInt(session.userId);

  const toInstance = await tenantDb.module_instances.findFirst({
    where: { id: BigInt(body.toInstanceId), module_name: "PHARMACY", status: "ACTIVE" },
  });
  if (!toInstance) throw new HttpError(404, "target_instance_not_found");

  const tid = requireTenantId();
  const result = await tenantDb.$transaction(async (tx) => {
    const [from] = await tx.$queryRawUnsafe(`SELECT * FROM pharmacy_stock WHERE id = ? AND tenant_id = ? FOR UPDATE`, BigInt(body.stockId), BigInt(tid));
    if (!from) throw new HttpError(404, "source_batch_not_found");
    if (String(from.module_instance_id) === String(toInstance.id)) throw new HttpError(400, "same_instance");
    if (from.quantity < body.quantity) throw new HttpError(400, "insufficient_stock");

    await tx.pharmacy_stock.update({ where: { id: from.id }, data: { quantity: { decrement: body.quantity } } });

    const existing = await tx.pharmacy_stock.findFirst({
      where: { medicine_name: from.medicine_name, batch_number: from.batch_number, module_instance_id: toInstance.id },
    });
    let toStockId;
    if (existing) {
      toStockId = existing.id;
      await tx.pharmacy_stock.update({ where: { id: toStockId }, data: { quantity: { increment: body.quantity } } });
    } else {
      const created = await tx.pharmacy_stock.create({
        data: {
          medicine_name: from.medicine_name,
          medicine_id: from.medicine_id,
          batch_number: from.batch_number,
          expiry_date: from.expiry_date,
          manufacturing_date: from.manufacturing_date,
          purchase_rate: from.purchase_rate,
          mrp: from.mrp,
          selling_rate: from.selling_rate,
          quantity: body.quantity,
          module_instance_id: toInstance.id,
        },
      });
      toStockId = created.id;
    }

    const transfer = await tx.stock_transfers.create({
      data: {
        medicine_id: from.medicine_id,
        from_instance_id: from.module_instance_id,
        to_instance_id: toInstance.id,
        from_stock_id: from.id,
        to_stock_id: toStockId,
        batch_number: from.batch_number,
        quantity: body.quantity,
        reason: body.reason || null,
        performed_by: uid,
      },
    });

    await tx.pharmacy_stock_movements.create({
      data: { stock_id: from.id, type: "TRANSFER_OUT", quantity_delta: -body.quantity, performed_by: uid, reference_type: "TRANSFER", reference_id: transfer.id, reason: body.reason || null },
    });
    await tx.pharmacy_stock_movements.create({
      data: { stock_id: toStockId, type: "TRANSFER_IN", quantity_delta: body.quantity, performed_by: uid, reference_type: "TRANSFER", reference_id: transfer.id, reason: body.reason || null },
    });

    return { transfer, fromInstanceId: from.module_instance_id };
  });

  emitToModule(session.tenantId, "PHARMACY", "stock:updated", { transferId: Number(result.transfer.id) });
  return json({ transferId: Number(result.transfer.id) }, 201);
});
