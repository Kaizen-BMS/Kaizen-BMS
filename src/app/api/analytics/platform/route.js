import { apiRoute, json } from "@/lib/apiRoute";
import { getPlatformAnalytics } from "@/lib/analytics/queries";

export const dynamic = "force-dynamic";

// Platform (Super Admin) analytics — cross-tenant, raw prisma (session has
// tenantId: null, same shape as every other /api/admin/* platform screen).
// Gated on analytics:platform, a PLATFORM_ONLY_ACTION (rbac.js) — SUPER_ADMIN
// only, regardless of HOSPITAL_ADMIN's wildcard, same discipline as
// tenant:read/tenant:manage.
export const GET = apiRoute("analytics:platform", async (request) => {
  const { searchParams } = new URL(request.url);
  const data = await getPlatformAnalytics(Object.fromEntries(searchParams));
  return json(data);
});
