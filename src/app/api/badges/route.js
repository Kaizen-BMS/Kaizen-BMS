import { apiRoute, json } from "@/lib/apiRoute";
import { can } from "@/lib/rbac";
import { tenantDb } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

// Attention counts for the sidebar. Only the counts the viewer's role can
// act on are returned. Clients fetch once, then refetch on the matching
// socket event — never on a timer.
export const GET = apiRoute(null, async (_request, { session }) => {
  if (session.tenantId == null) return json({ badges: {} });
  const badges = {};

  if (can(session.role, "stock:read")) {
    badges.pharmacy = await tenantDb.prescriptions.count({ where: { status: "PENDING" } });
  }

  if (can(session.role, "lab:read")) {
    badges.lab = await tenantDb.lab_orders.count({
      where: { status: { in: ["ORDERED", "IN_PROGRESS"] } },
    });
  }

  if (can(session.role, "bed:read")) {
    badges.ipd = await tenantDb.beds.count({ where: { status: "CLEANING" } });
  }

  return json({ badges });
});
