import { apiRoute, json } from "@/lib/apiRoute";
import { can } from "@/lib/rbac";
import { prisma, tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { getDefaultInstance } from "@/lib/moduleInstances";
import { isModuleActive } from "@/lib/modules";

export const dynamic = "force-dynamic";

// Where can this doctor send things right now? Always names the place: our own
// pharmacy / radiology department, or a connected partner pharmacy.
export const GET = apiRoute(null, async (request, { session }) => {
  const tenantId = requireTenantId();
  const me = await prisma.tenants.findUnique({ where: { id: BigInt(tenantId) }, select: { name: true } });
  const pharmacies = [];
  if (can(session.role, "prescription:create")) {
    if (await isModuleActive(tenantId, "PHARMACY").catch(() => false)) {
      pharmacies.push({ id: "own", own: true, name: `${me?.name || "Our"} Pharmacy` });
    }
    const source = await getDefaultInstance(tenantDb, tenantId, "DOCTOR_OPD");
    if (source) {
      const conns = await tenantDb.external_connections.findMany({
        where: { source_instance_id: source.id, connection_type: "EXTERNAL_PHARMACY_PRESCRIPTION", status: "ACTIVE" },
        include: { external_providers: true },
      });
      for (const c of conns) {
        const ep = c.external_providers;
        if (ep?.active && ep.provider_type === "PHARMACY" && String(ep.provider_code).startsWith("PEER_")) {
          pharmacies.push({ id: String(Number(c.provider_id)), own: false, name: ep.name });
        }
      }
    }
  }
  return json({ pharmacies });
});
