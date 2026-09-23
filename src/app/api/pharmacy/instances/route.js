import { apiRoute, json } from "@/lib/apiRoute";
import { listInstances } from "@/lib/moduleInstances";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// Just enough to pick a transfer destination — id + name + status, gated
// on the transfer action itself (not the admin-only moduleinstance:read),
// since a pharmacist needs this to move stock between two named pharmacies.
export const GET = apiRoute("stocktransfer:create", async (_request, { session }) => {
  const instances = await listInstances(tenantDb, session.tenantId, "PHARMACY");
  return json({ instances: instances.map((i) => ({ id: Number(i.id), name: i.name, status: i.status })) });
});
