import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { transaction } from "@/lib/db";
import { requireTenantId, scopedQueryOne } from "@/lib/repo/tenant";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  medicineName: z.string().trim().min(1).max(191),
  batchNumber: z.string().trim().min(1).max(191),
  expiryDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
});

// Stock-IN — receive new stock into a batch. Adding to an existing
// (medicine, batch) increments its quantity rather than creating a
// duplicate row.
export const POST = apiRoute("stock:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const tid = requireTenantId();
  const expiry = body.expiryDate || null;

  const stockId = await transaction(async (conn) => {
    const [existingRows] = await conn.execute(
      `SELECT id FROM pharmacy_stock
        WHERE tenant_id = ? AND medicine_name = ? AND batch_number = ?
        LIMIT 1`,
      [tid, body.medicineName, body.batchNumber],
    );
    let id;
    if (existingRows[0]) {
      id = existingRows[0].id;
      await conn.execute(
        `UPDATE pharmacy_stock
            SET quantity = quantity + ?, expiry_date = COALESCE(?, expiry_date)
          WHERE id = ?`,
        [body.quantity, expiry, id],
      );
    } else {
      const [res] = await conn.execute(
        `INSERT INTO pharmacy_stock (tenant_id, medicine_name, batch_number, expiry_date, quantity)
         VALUES (?, ?, ?, ?, ?)`,
        [tid, body.medicineName, body.batchNumber, expiry, body.quantity],
      );
      id = res.insertId;
    }
    await conn.execute(
      `INSERT INTO pharmacy_stock_movements (tenant_id, stock_id, type, quantity_delta, performed_by)
       VALUES (?, ?, 'IN', ?, ?)`,
      [tid, id, body.quantity, session.userId],
    );
    return id;
  });

  const batch = await scopedQueryOne("SELECT * FROM pharmacy_stock WHERE tenant_id = :tid AND id = :id", {
    id: stockId,
  });

  emitToModule(session.tenantId, "PHARMACY", "stock:updated", { batch });
  return json({ batch }, 201);
});
