import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { medicineUpdateSchema, serializeMedicine, toRow } from "@/lib/medicineCatalog";

export const dynamic = "force-dynamic";

export const PATCH = apiRoute("medicine:manage", async (request, { session, params }) => {
  const { id } = await params;
  const existing = await tenantDb.medicines.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, medicineUpdateSchema);
  if (body.barcode) {
    const dupe = await tenantDb.medicines.findFirst({ where: { barcode: body.barcode, id: { not: existing.id } }, select: { id: true } });
    if (dupe) throw new HttpError(409, "barcode_already_used");
  }
  const uid = BigInt(session.userId);
  const data = toRow({ ...serializeMedicine(existing), ...body }, uid);
  if (body.active !== undefined) data.active = body.active;
  const updated = await tenantDb.medicines.update({ where: { id: existing.id }, data });
  return json({ medicine: serializeMedicine(updated) });
});
