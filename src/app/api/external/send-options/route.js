import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { can } from "@/lib/rbac";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { getDefaultInstance } from "@/lib/moduleInstances";

export const dynamic = "force-dynamic";

const CONTRACT = { LAB: "EXTERNAL_LAB_ORDER", PHARMACY: "EXTERNAL_PHARMACY_PRESCRIPTION" };
const ACTION = { LAB: "laborder:create", PHARMACY: "prescription:create" };

// Which connected external laboratories / pharmacies can this facility send
// to right now? Only ACTIVE connections to active providers are listed, so
// the UI can auto-select a single one, offer a choice for several, or point
// to "Connect" when there are none. Names only are meant for display.
export const GET = apiRoute(null, async (request, { session }) => {
  const type = new URL(request.url).searchParams.get("type");
  if (!CONTRACT[type]) throw new HttpError(400, "invalid_type");
  if (!can(session.role, ACTION[type])) throw new HttpError(403, "forbidden");
  const tenantId = requireTenantId();
  const source = await getDefaultInstance(tenantDb, tenantId, "DOCTOR_OPD");
  if (!source) return json({ providers: [] });
  const conns = await tenantDb.external_connections.findMany({
    where: { source_instance_id: source.id, connection_type: CONTRACT[type], status: "ACTIVE" },
    include: { external_providers: true },
    orderBy: { updated_at: "desc" },
  });
  const providers = conns
    .filter((c) => c.external_providers?.active && c.external_providers.provider_type === type)
    .map((c) => ({ id: Number(c.provider_id), name: c.external_providers.name }));
  return json({ providers });
});
