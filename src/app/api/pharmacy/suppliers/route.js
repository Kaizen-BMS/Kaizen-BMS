import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { supplierInputSchema, serializeSupplier, toRow } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

export const GET = apiRoute("supplier:read", async () => {
  const rows = await tenantDb.suppliers.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  return json({ suppliers: rows.map(serializeSupplier) });
});

export const POST = apiRoute("supplier:manage", async (request) => {
  const body = await parseBody(request, supplierInputSchema);
  const created = await tenantDb.suppliers.create({ data: toRow(body) });
  return json({ supplier: serializeSupplier(created) }, 201);
});
