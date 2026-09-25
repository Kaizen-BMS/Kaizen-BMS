import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { medicineInputSchema, serializeMedicine, toRow } from "@/lib/medicineCatalog";
import { MEDICINE_TYPES, SCHEDULES } from "@/lib/medicineTypes";
import { requireTenantId } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

const listQuery = z.object({
  q: z.string().trim().max(191).optional(),
  active: z.enum(["true", "false"]).optional(),
});

// The Medicine Master — what this pharmacy stocks, independent of any one
// physical batch. Search covers name / generic / brand / barcode.
export const GET = apiRoute("medicine:read", async (request) => {
  const { searchParams } = new URL(request.url);
  const q = listQuery.parse(Object.fromEntries(searchParams));
  const where = {};
  if (q.active != null) where.active = q.active === "true";
  if (q.q) {
    where.OR = [
      { name: { contains: q.q } },
      { generic_name: { contains: q.q } },
      { brand_name: { contains: q.q } },
      { barcode: { contains: q.q } },
      { composition: { contains: q.q } },
      { base_name: { contains: q.q } },
    ];
  }
  const rows = await tenantDb.medicines.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }] });
  const tid = BigInt(requireTenantId());
  // Current usable stock per medicine (non-expired units) for the Medicine List.
  const stock = await tenantDb.$queryRawUnsafe(
    `SELECT medicine_id, COALESCE(SUM(quantity),0) AS q, COUNT(*) AS batches FROM pharmacy_stock
      WHERE tenant_id = ? AND medicine_id IS NOT NULL AND quantity > 0 AND (expiry_date IS NULL OR expiry_date >= CURDATE())
      GROUP BY medicine_id`,
    tid,
  );
  const stockById = new Map(stock.map((r) => [String(r.medicine_id), { stock: Number(r.q), batches: Number(r.batches) }]));
  // The exact batch a sale would actually draw from next (same FEFO order dispense/walk-in-sale
  // use) — so the price shown here is never a guess, it's what the next unit really costs.
  const nextBatch = await tenantDb.$queryRawUnsafe(
    `SELECT medicine_id, selling_rate, mrp, purchase_rate FROM (
       SELECT medicine_id, selling_rate, mrp, purchase_rate,
              ROW_NUMBER() OVER (PARTITION BY medicine_id ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, id ASC) AS rn
         FROM pharmacy_stock
        WHERE tenant_id = ? AND medicine_id IS NOT NULL AND quantity > 0 AND (expiry_date IS NULL OR expiry_date >= CURDATE())
     ) x WHERE rn = 1`,
    tid,
  );
  const priceById = new Map(nextBatch.map((r) => [String(r.medicine_id), {
    sellingRate: r.selling_rate != null ? Number(r.selling_rate) : r.mrp != null ? Number(r.mrp) : null,
    mrp: r.mrp != null ? Number(r.mrp) : null,
    purchaseRate: r.purchase_rate != null ? Number(r.purchase_rate) : null,
  }]));
  return json({
    medicines: rows.map((m) => {
      const s = stockById.get(String(m.id));
      return {
        ...serializeMedicine(m),
        stock: s?.stock || 0,
        batchCount: s?.batches || 0,
        // Price of the next batch that would actually be dispensed — null when there's no usable
        // stock to price from yet. Multiple batches can each carry a different rate; this is
        // always the one FEFO would use next, never an average or a guess.
        ...(priceById.get(String(m.id)) || { sellingRate: null, mrp: null, purchaseRate: null }),
      };
    }),
    types: MEDICINE_TYPES,
    schedules: SCHEDULES,
  });
});

export const POST = apiRoute("medicine:manage", async (request, { session }) => {
  const body = await parseBody(request, medicineInputSchema);
  if (!body.baseName && !body.name) throw new HttpError(400, "medicine_name_required");
  if (body.barcode) {
    const dupe = await tenantDb.medicines.findFirst({ where: { barcode: body.barcode }, select: { id: true } });
    if (dupe) throw new HttpError(409, "barcode_already_used");
  }
  const uid = BigInt(session.userId);
  const row = toRow(body, uid);
  const dupeName = await tenantDb.medicines.findFirst({ where: { name: row.name }, select: { id: true } });
  if (dupeName) throw new HttpError(409, "medicine_already_exists");
  const created = await tenantDb.medicines.create({ data: { ...row, created_by: uid } });
  return json({ medicine: serializeMedicine(created) }, 201);
});
