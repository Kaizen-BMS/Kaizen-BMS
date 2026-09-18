import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { isModuleActive } from "@/lib/modules";
import { getPharmacyAnalytics } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

export const GET = apiRoute("analytics:view", async (request, { session }) => {
  if (!(await isModuleActive(session.tenantId, "PHARMACY"))) throw new HttpError(403, "forbidden");
  const { searchParams } = new URL(request.url);
  const data = await getPharmacyAnalytics(session.tenantId, Object.fromEntries(searchParams));
  return json(data);
});
