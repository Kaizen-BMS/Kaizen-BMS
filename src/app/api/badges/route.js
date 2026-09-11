import { apiRoute, json } from "@/lib/apiRoute";
import { can } from "@/lib/rbac";
import { scopedQueryOne } from "@/lib/repo/tenant";

export const dynamic = "force-dynamic";

// Attention counts for the sidebar. Only the counts the viewer's role can
// act on are returned. Clients fetch once, then refetch on the matching
// socket event — never on a timer.
export const GET = apiRoute(null, async (_request, { session }) => {
  if (session.tenantId == null) return json({ badges: {} });
  const badges = {};

  if (can(session.role, "stock:read")) {
    const r = await scopedQueryOne(
      `SELECT COUNT(*) AS n FROM prescriptions
        WHERE tenant_id = :tid AND status = 'PENDING'`,
    );
    badges.pharmacy = Number(r.n);
  }

  if (can(session.role, "lab:read")) {
    const r = await scopedQueryOne(
      `SELECT COUNT(*) AS n FROM lab_orders
        WHERE tenant_id = :tid AND status IN ('ORDERED', 'IN_PROGRESS')`,
    );
    badges.lab = Number(r.n);
  }

  if (can(session.role, "bed:read")) {
    const r = await scopedQueryOne(
      `SELECT COUNT(*) AS n FROM beds WHERE tenant_id = :tid AND status = 'CLEANING'`,
    );
    badges.ipd = Number(r.n);
  }

  return json({ badges });
});
