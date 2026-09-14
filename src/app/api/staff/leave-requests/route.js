import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { can } from "@/lib/rbac";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Every staff role can see the leave calendar (staffroster:read) — who's
// on leave and when, for scheduling awareness — but a colleague's REASON
// is a privacy boundary, not just a UI nicety: it's stripped here, in the
// API response itself, for every row that isn't the caller's own and isn't
// visible to someone with staff:manage (HOSPITAL_ADMIN, who needs the
// reason to actually approve/reject).
export const GET = apiRoute("staffroster:read", async (request, { session }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return json({ error: "from and to (YYYY-MM-DD) are required" }, 400);

  const tid = requireTenantId();
  const rows = await tenantDb.$queryRawUnsafe(
    `SELECT l.id, l.user_id, l.from_date, l.to_date, l.reason, l.status, l.approved_by, l.created_at, u.name AS user_name
       FROM leave_requests l JOIN users u ON u.id = l.user_id
      WHERE l.tenant_id = ? AND l.from_date <= ? AND l.to_date >= ?
      ORDER BY l.from_date ASC`,
    BigInt(tid),
    to,
    from,
  );

  const canSeeAll = can(session.role, "staff:manage");
  const leaveRequests = rows.map((r) => ({
    ...r,
    reason: canSeeAll || String(r.user_id) === String(session.userId) ? r.reason : null,
  }));
  return json({ leaveRequests });
});

const createSchema = z
  .object({
    fromDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    toDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().min(1).max(500),
  })
  .refine((b) => b.toDate >= b.fromDate, { message: "toDate must be on or after fromDate" });

// Self-service only — user_id is always the caller, never client-supplied.
export const POST = apiRoute("leaverequest:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);

  const leaveRequest = await tenantDb.leave_requests.create({
    data: {
      user_id: BigInt(session.userId),
      from_date: new Date(body.fromDate),
      to_date: new Date(body.toDate),
      reason: body.reason,
      status: "PENDING",
    },
  });
  emitToTenant(session.tenantId, "leaverequest:created", { leaveRequest });
  return json({ leaveRequest }, 201);
});
