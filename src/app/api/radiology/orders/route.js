import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { serializeOrder, attachDoctorNames, RADIOLOGY_STATUSES } from "@/lib/radiology";

export const dynamic = "force-dynamic";

// The Radiology worklist — one queue, filterable by status (the UI's own
// Pending/In Progress/Completed tabs are just this filter applied
// client-side or via ?status=), same shape as GET /api/pharmacy/queue and
// GET /api/lab/queue.
export const GET = apiRoute("radiology:read", async (request, { session }) => {
  const status = new URL(request.url).searchParams.get("status");
  const where = {};
  if (status) {
    if (!RADIOLOGY_STATUSES.includes(status)) return json({ error: "invalid_status" }, 400);
    where.status = status;
  }

  const rows = await tenantDb.radiology_orders.findMany({
    where,
    orderBy: [{ status: "asc" }, { id: "desc" }],
    include: { patients: { select: { name: true } } },
    take: 200,
  });
  const radiologyOrders = await attachDoctorNames(tenantDb, session.tenantId, rows.map(serializeOrder));
  return json({ radiologyOrders });
});
