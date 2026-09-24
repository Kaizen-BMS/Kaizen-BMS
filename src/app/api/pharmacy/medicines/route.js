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
  // Current usable stock per medicine (non-expired units) for the Medicine List.
  const stock = await tenantDb.$queryRawUnsafe(
    `SELECT medicine_id, COALESCE(SUM(quantity),0) AS q FROM pharmacy_stock
      WHERE tenant_id = ? AND medicine_id IS NOT NULL AND (expiry_date IS NULL OR expiry_date >= CURDATE())
      GROUP BY medicine_id`,
    BigInt(requireTenantId()),
  );
  const stockById = new Map(stock.map((r) => [String(r.medicine_id), Number(r.q)]));
  return json({
    medicines: rows.map((m) => ({ ...serializeMedicine(m), stock: stockById.get(String(m.id)) || 0 })),
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
