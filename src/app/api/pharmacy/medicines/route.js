import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { medicineInputSchema, serializeMedicine, toRow } from "@/lib/medicineCatalog";
import { MEDICINE_TYPES, SCHEDULES } from "@/lib/medicineTypes";

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
    ];
  }
  const rows = await tenantDb.medicines.findMany({ where, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return json({ medicines: rows.map(serializeMedicine), types: MEDICINE_TYPES, schedules: SCHEDULES });
});

export const POST = apiRoute("medicine:manage", async (request, { session }) => {
  const body = await parseBody(request, medicineInputSchema);
  if (body.barcode) {
    const dupe = await tenantDb.medicines.findFirst({ where: { barcode: body.barcode }, select: { id: true } });
    if (dupe) throw new HttpError(409, "barcode_already_used");
  }
  const uid = BigInt(session.userId);
  const created = await tenantDb.medicines.create({ data: { ...toRow(body, uid), created_by: uid } });
  return json({ medicine: serializeMedicine(created) }, 201);
});
