import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { getActiveModules } from "@/lib/modules";
import { getTenant } from "@/lib/tenants";
import { getAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// Alerts & Notifications Center — action: null, same shape as
// GET /api/dashboard/overview: different roles see different SUBSETS of
// this one endpoint (decided by getAlerts()'s own per-category role/module
// checks), not a single RBAC action gating the whole response. Every
// number is a real query against data this product already computes
// elsewhere (Pharmacy inventory, Phase 9 workflows, Staff leave
// requests) — no new table, no fabricated counts.
export const GET = apiRoute(null, async (_request, { session }) => {
  if (session.tenantId == null) return json({ categories: {} });

  const tenant = await getTenant(session.tenantId);
  const activeModules = await getActiveModules(session.tenantId);
  const { categories } = await getAlerts(tenantDb, {
    session,
    tenantType: tenant?.type ?? null,
    activeModules,
  });

  return json({ categories });
});
