import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { resolveInstance } from "@/lib/moduleInstances";
import { computeMedicineAlerts } from "@/lib/pharmacyAlerts";

export const dynamic = "force-dynamic";

// Batch-wise stock, grouped by medicine, with low-stock and expiry flags —
// the "current inventory view" + the alerts screen in one payload.
// Optional ?moduleInstanceId= scopes to one Pharmacy instance; omitted (as
// every existing caller does today) resolves to the tenant's default
// instance — see CLAUDE.md "Platform rebuild — Phase 2".
export const GET = apiRoute("stock:read", async (request, { session }) => {
  const instanceParam = new URL(request.url).searchParams.get("moduleInstanceId");
  const instance = await resolveInstance(tenantDb, session.tenantId, "PHARMACY", instanceParam);

  const [batches, thresholds] = await Promise.all([
    tenantDb.pharmacy_stock.findMany({
      where: { module_instance_id: instance.id },
      orderBy: [{ medicine_name: "asc" }, { expiry_date: "asc" }, { id: "asc" }],
    }),
    tenantDb.pharmacy_thresholds.findMany({
      select: { medicine_name: true, low_stock_threshold: true },
    }),
  ]);

  const medicines = computeMedicineAlerts(batches, thresholds);

  return json({ medicines, instance: { id: Number(instance.id), name: instance.name } });
});
