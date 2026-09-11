import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { transaction } from "@/lib/db";
import { requireTenantId, scopedQueryOne } from "@/lib/repo/tenant";
import { emitToModule, emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const dispenseSchema = z.object({
  quantity: z.coerce.number().int().min(1).optional(),
});

// FEFO dispensing: consumes the item's remaining quantity from whichever
// non-expired batches of that medicine run out soonest, oldest-expiry
// first, across as many batches as it takes. Partial dispensing is allowed
// when stock falls short — never a strict all-or-nothing block.
export const POST = apiRoute("dispense:create", async (request, ctx) => {
  const { itemId } = await ctx.params;
  const id = Number(itemId);
  const tid = requireTenantId();

  const item = await scopedQueryOne(
    `SELECT i.*, pr.id AS prescription_id
       FROM prescription_items i
       JOIN prescriptions pr ON pr.id = i.prescription_id
      WHERE i.tenant_id = :tid AND i.id = :id`,
    { id },
  );
  if (!item) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, dispenseSchema);
  const outstanding = item.quantity - item.dispensed_quantity;
  if (outstanding <= 0) throw new HttpError(400, "already fully dispensed");
  const requested = Math.min(body.quantity ?? outstanding, outstanding);

  const result = await transaction(async (conn) => {
    const [batches] = await conn.execute(
      `SELECT * FROM pharmacy_stock
        WHERE tenant_id = ? AND medicine_name = ? AND quantity > 0
          AND (expiry_date IS NULL OR expiry_date >= CURDATE())
        ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, id ASC
        FOR UPDATE`,
      [tid, item.medicine_name],
    );

    let remaining = requested;
    const consumed = [];
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      if (take <= 0) continue;
      await conn.execute("UPDATE pharmacy_stock SET quantity = quantity - ? WHERE id = ?", [
        take,
        batch.id,
      ]);
      await conn.execute(
        `INSERT INTO pharmacy_stock_movements
           (tenant_id, stock_id, type, quantity_delta, prescription_item_id, performed_by)
         VALUES (?, ?, 'DISPENSE', ?, ?, ?)`,
        [tid, batch.id, -take, id, ctx.session.userId],
      );
      consumed.push({ batchId: batch.id, batchNumber: batch.batch_number, quantity: take });
      remaining -= take;
    }

    const dispensedNow = requested - remaining;
    const newDispensed = item.dispensed_quantity + dispensedNow;
    const itemStatus =
      newDispensed >= item.quantity ? "DISPENSED" : dispensedNow > 0 ? "PENDING" : "OUT_OF_STOCK";
    const primaryBatch = consumed[consumed.length - 1]?.batchNumber ?? item.batch_number;

    await conn.execute(
      `UPDATE prescription_items
          SET dispensed_quantity = ?, status = ?, batch_number = ?
        WHERE tenant_id = ? AND id = ?`,
      [newDispensed, itemStatus, primaryBatch, tid, id],
    );

    const [allItems] = await conn.execute(
      "SELECT quantity, dispensed_quantity FROM prescription_items WHERE tenant_id = ? AND prescription_id = ?",
      [tid, item.prescription_id],
    );
    const allDone = allItems.every((i) => i.dispensed_quantity >= i.quantity);
    const anyDone = allItems.some((i) => i.dispensed_quantity > 0);
    const prescriptionStatus = allDone ? "FULFILLED" : anyDone ? "PARTIALLY_FULFILLED" : "PENDING";

    if (prescriptionStatus === "FULFILLED") {
      await conn.execute(
        `UPDATE prescriptions SET status = ?, fulfilled_by = ?, fulfilled_at = CURRENT_TIMESTAMP(3)
          WHERE tenant_id = ? AND id = ?`,
        [prescriptionStatus, ctx.session.userId, tid, item.prescription_id],
      );
    } else {
      await conn.execute("UPDATE prescriptions SET status = ? WHERE tenant_id = ? AND id = ?", [
        prescriptionStatus,
        tid,
        item.prescription_id,
      ]);
    }

    return { consumed, dispensedNow, itemStatus, prescriptionStatus };
  });

  const updatedItem = await scopedQueryOne(
    "SELECT * FROM prescription_items WHERE tenant_id = :tid AND id = :id",
    { id },
  );
  const updatedBatches = [];
  for (const c of result.consumed) {
    const batch = await scopedQueryOne("SELECT * FROM pharmacy_stock WHERE tenant_id = :tid AND id = :id", {
      id: c.batchId,
    });
    if (batch) updatedBatches.push(batch);
  }

  emitToModule(ctx.session.tenantId, "PHARMACY", "dispense:created", {
    item: updatedItem,
    consumed: result.consumed,
  });
  emitToModule(ctx.session.tenantId, "PHARMACY", "stock:updated", { batches: updatedBatches });
  emitToTenant(ctx.session.tenantId, "prescription:updated", {
    prescription: { id: item.prescription_id, status: result.prescriptionStatus },
  });

  return json({
    item: updatedItem,
    consumed: result.consumed,
    prescriptionStatus: result.prescriptionStatus,
  });
});
