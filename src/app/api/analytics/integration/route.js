import { apiRoute, json } from "@/lib/apiRoute";
import { getIntegrationAnalytics } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

// Integration Monitoring's trend view — outbound/inbound activity per
// external provider over a date range. Gated on external:read (same
// wildcard-only admin action as the rest of External Integration), not
// analytics:view — this is integration-config data, not a clinical-staff
// analytics domain.
export const GET = apiRoute("external:read", async (request, { session }) => {
  const { searchParams } = new URL(request.url);
  const data = await getIntegrationAnalytics(session.tenantId, Object.fromEntries(searchParams));
  return json(data);
});
