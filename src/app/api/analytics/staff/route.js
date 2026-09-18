import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { getStaffAnalytics } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

// Core (not module-gated), same tenantTypes:["HOSPITAL"] boundary as Staff
// Management itself — a solo tenant has no staff hierarchy to analyze.
export const GET = apiRoute("analytics:view", async (request, { session, tenant }) => {
  if (tenant && tenant.type !== "HOSPITAL") throw new HttpError(403, "forbidden");
  const { searchParams } = new URL(request.url);
  const data = await getStaffAnalytics(session.tenantId, Object.fromEntries(searchParams));
  return json(data);
});
