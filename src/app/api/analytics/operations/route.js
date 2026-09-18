import { apiRoute, json } from "@/lib/apiRoute";
import { getOperationsAnalytics } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

// Hospital Operations analytics — core, not module-gated (every tenant has
// patients/visits). Per-route module checks live here rather than in
// modules.js's shared ACTION_MODULE map, since each analytics domain needs
// a DIFFERENT module check (see rbac.js's own comment on why analytics:view
// was left out of that map).
export const GET = apiRoute("analytics:view", async (request, { session }) => {
  const { searchParams } = new URL(request.url);
  const data = await getOperationsAnalytics(session.tenantId, Object.fromEntries(searchParams));
  return json(data);
});
