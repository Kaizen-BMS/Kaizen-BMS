import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { resolveInstance } from "@/lib/moduleInstances";
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
  // Optional — omitted (as every existing caller does today) resolves to
  // the tenant's default Pharmacy instance, so this is fully backward
  // compatible. See CLAUDE.md "Platform rebuild — Phase 2".
  moduleInstanceId: z.coerce.number().int().positive().optional(),
});

// Stock-IN — receive new stock into a batch. Adding to an existing
// (medicine, batch) increments its quantity rather than creating a
// duplicate row. Batches are scoped per Pharmacy module_instance — two
// instances stocking the same medicine name + batch number are two
// separate rows, never merged.
export const POST = apiRoute("stock:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const expiry = body.expiryDate || null;
  const instance = await resolveInstance(tenantDb, session.tenantId, "PHARMACY", body.moduleInstanceId);

  const stockId = await tenantDb.$transaction(async (tx) => {
    const existing = await tx.pharmacy_stock.findFirst({
      where: { medicine_name: body.medicineName, batch_number: body.batchNumber, module_instance_id: instance.id },
      select: { id: true },
    });
    let id;
    if (existing) {
      id = existing.id;
      await tx.pharmacy_stock.update({
        where: { id },
        data: {
          quantity: { increment: body.quantity },
          ...(expiry ? { expiry_date: new Date(expiry) } : {}),
        },
      });
    } else {
      const created = await tx.pharmacy_stock.create({
        data: {
          medicine_name: body.medicineName,
          batch_number: body.batchNumber,
          expiry_date: expiry ? new Date(expiry) : null,
          quantity: body.quantity,
          module_instance_id: instance.id,
        },
      });
      id = created.id;
    }
    await tx.pharmacy_stock_movements.create({
      data: {
        stock_id: id,
        type: "IN",
        quantity_delta: body.quantity,
        performed_by: BigInt(session.userId),
      },
    });
    return id;
  });

  const batch = await tenantDb.pharmacy_stock.findUnique({ where: { id: stockId } });

  emitToModule(session.tenantId, "PHARMACY", "stock:updated", { batch });
  return json({ batch }, 201);
});
