import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { supplierUpdateSchema, serializeSupplier, toRow } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

export const PATCH = apiRoute("supplier:manage", async (request, { params }) => {
  const { id } = await params;
  const existing = await tenantDb.suppliers.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return json({ error: "not_found" }, 404);
  const body = await parseBody(request, supplierUpdateSchema);
  const data = toRow({ ...serializeSupplier(existing), ...body });
  if (body.active !== undefined) data.active = body.active;
  const updated = await tenantDb.suppliers.update({ where: { id: existing.id }, data });
  return json({ supplier: serializeSupplier(updated) });
});
