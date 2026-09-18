import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { isModuleActive } from "@/lib/modules";
import { getClinicalAnalytics } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

export const GET = apiRoute("analytics:view", async (request, { session }) => {
  if (!(await isModuleActive(session.tenantId, "DOCTOR_OPD"))) throw new HttpError(403, "forbidden");
  const { searchParams } = new URL(request.url);
  const data = await getClinicalAnalytics(session.tenantId, Object.fromEntries(searchParams));
  return json(data);
});
