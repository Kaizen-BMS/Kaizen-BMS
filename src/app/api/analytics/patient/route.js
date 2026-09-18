import { apiRoute, json } from "@/lib/apiRoute";
import { getPatientAnalytics } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

// Core (not module-gated) — every tenant registers patients.
export const GET = apiRoute("analytics:view", async (request, { session }) => {
  const { searchParams } = new URL(request.url);
  const data = await getPatientAnalytics(session.tenantId, Object.fromEntries(searchParams));
  return json(data);
});
