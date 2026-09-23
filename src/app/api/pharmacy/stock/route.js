import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { resolveInstance } from "@/lib/moduleInstances";
import { emitToModule } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  medicineName: z.string().trim().min(1).max(191),
  medicineId: z.coerce.number().int().positive().optional(),
  batchNumber: z.string().trim().min(1).max(191),
  manufacturingDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  expiryDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    .optional()
    .or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  purchaseRate: z.coerce.number().min(0).max(10_000_000).optional(),
  mrp: z.coerce.number().min(0).max(10_000_000).optional(),
  sellingRate: z.coerce.number().min(0).max(10_000_000).optional(),
  rack: z.string().trim().max(20).optional().or(z.literal("")),
  shelf: z.string().trim().max(20).optional().or(z.literal("")),
  bin: z.string().trim().max(20).optional().or(z.literal("")),
  supplierId: z.coerce.number().int().positive().optional(),
  // Optional — omitted (as every existing caller does today) resolves to
  // the tenant's default Pharmacy instance, so this is fully backward
  // compatible. See CLAUDE.md "Platform rebuild — Phase 2".
  moduleInstanceId: z.coerce.number().int().positive().optional(),
});

// Stock-IN — receive new stock into a batch. Adding to an existing
// (medicine, batch) increments its quantity rather than creating a
// duplicate row. Batches are scoped per Pharmacy module_instance — two
// instances stocking the same medicine name + batch number are two
// separate rows, never merged. `medicineId` links it to the Medicine
// Master when known (an explicit id, or auto-matched by exact name below,
// never guessed beyond an exact match) — the batch still always carries
// its own commercial detail (rate/MRP/rack), same as a real pharmacy: two
// batches of the one medicine can legitimately cost different amounts.
export const POST = apiRoute("stock:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const expiry = body.expiryDate || null;
  const mfg = body.manufacturingDate || null;
  const instance = await resolveInstance(tenantDb, session.tenantId, "PHARMACY", body.moduleInstanceId);

  const stockId = await tenantDb.$transaction(async (tx) => {
    let medicineId = body.medicineId ?? null;
    if (!medicineId) {
      const match = await tx.medicines.findFirst({ where: { name: body.medicineName }, select: { id: true } });
      medicineId = match?.id ?? null;
    }

    const existing = await tx.pharmacy_stock.findFirst({
      where: { medicine_name: body.medicineName, batch_number: body.batchNumber, module_instance_id: instance.id },
      select: { id: true },
    });
    const rateFields = {
      ...(body.purchaseRate != null ? { purchase_rate: body.purchaseRate } : {}),
      ...(body.mrp != null ? { mrp: body.mrp } : {}),
      ...(body.sellingRate != null ? { selling_rate: body.sellingRate } : {}),
      ...(body.rack ? { rack: body.rack } : {}),
      ...(body.shelf ? { shelf: body.shelf } : {}),
      ...(body.bin ? { bin: body.bin } : {}),
      ...(body.supplierId ? { supplier_id: BigInt(body.supplierId) } : {}),
      ...(mfg ? { manufacturing_date: new Date(mfg) } : {}),
    };
    let id;
    if (existing) {
      id = existing.id;
      await tx.pharmacy_stock.update({
        where: { id },
        data: {
          quantity: { increment: body.quantity },
          ...(expiry ? { expiry_date: new Date(expiry) } : {}),
          ...(medicineId ? { medicine_id: BigInt(medicineId) } : {}),
          ...rateFields,
        },
      });
    } else {
      const created = await tx.pharmacy_stock.create({
        data: {
          medicine_name: body.medicineName,
          medicine_id: medicineId ? BigInt(medicineId) : null,
          batch_number: body.batchNumber,
          expiry_date: expiry ? new Date(expiry) : null,
          quantity: body.quantity,
          module_instance_id: instance.id,
          ...rateFields,
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
