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
  // The display name is only re-composed when the user actually changed the
  // name / type / strength — a plain "switch off" never renames a medicine.
  const identityChanged = body.baseName !== undefined || body.medicineType !== undefined || body.strength !== undefined;
  const merged = { ...serializeMedicine(existing), ...body };
  if (!identityChanged) merged.baseName = undefined;
  const data = toRow({ ...merged, name: identityChanged ? merged.name : existing.name }, uid);
  if (!identityChanged) {
    data.name = existing.name;
    data.base_name = existing.base_name || existing.name;
  }
  if (body.active !== undefined) data.active = body.active;

  const updated = await tenantDb.$transaction(async (tx) => {
    const row = await tx.medicines.update({ where: { id: existing.id }, data });
    // Stock rows carry the display name as text (FEFO/prescriptions match on it) — keep them in step.
    if (row.name !== existing.name) {
      await tx.pharmacy_stock.updateMany({ where: { medicine_id: existing.id }, data: { medicine_name: row.name } });
    }
    return row;
  });
  return json({ medicine: serializeMedicine(updated) });
});
