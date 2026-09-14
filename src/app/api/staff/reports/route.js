import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb, prisma } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["HOSPITAL_ADMIN", "DOCTOR", "NURSE", "PHARMACIST", "LAB_TECH", "BILLING_STAFF", "RECEPTIONIST"];

function daysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1;
}

// Staff-focused reports — distinct from a future hospital-wide Reports &
// Analytics dashboard. Three things, per the product spec: attendance %
// per staff, leave taken (NOT "vs remaining" — there is no leave-quota/
// entitlement concept anywhere in this schema, so "remaining" isn't
// honestly computable; reporting only what's actually knowable), and a
// roster coverage view flagging shifts with zero doctors scheduled.
export const GET = apiRoute("staff:manage", async (request, { session }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return json({ error: "from and to (YYYY-MM-DD) are required" }, 400);

  const tid = requireTenantId();
  const totalDays = daysBetween(from, to);

  const users = await prisma.users.findMany({
    where: { tenant_id: BigInt(session.tenantId), role: { in: STAFF_ROLES } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  const attendanceRows = await tenantDb.$queryRawUnsafe(
    `SELECT subject_id AS user_id, COUNT(DISTINCT work_date) AS days_present
       FROM attendance_logs
      WHERE tenant_id = ? AND subject_type = 'USER' AND work_date BETWEEN ? AND ? AND check_in_at IS NOT NULL
      GROUP BY subject_id`,
    BigInt(tid),
    from,
    to,
  );
  const attendanceByUser = new Map(attendanceRows.map((r) => [String(r.user_id), Number(r.days_present)]));

  const leaveRows = await tenantDb.$queryRawUnsafe(
    `SELECT user_id, SUM(DATEDIFF(LEAST(to_date, ?), GREATEST(from_date, ?)) + 1) AS days_taken
       FROM leave_requests
      WHERE tenant_id = ? AND status = 'APPROVED' AND from_date <= ? AND to_date >= ?
      GROUP BY user_id`,
    to,
    from,
    BigInt(tid),
    to,
    from,
  );
  const leaveByUser = new Map(leaveRows.map((r) => [String(r.user_id), Number(r.days_taken)]));

  const staff = users.map((u) => {
    const daysPresent = attendanceByUser.get(String(u.id)) || 0;
    return {
      userId: Number(u.id),
      name: u.name,
      role: u.role,
      attendancePct: totalDays > 0 ? Math.round((daysPresent / totalDays) * 1000) / 10 : 0,
      daysPresent,
      leaveDaysTaken: leaveByUser.get(String(u.id)) || 0,
    };
  });

  const understaffedShifts = await tenantDb.$queryRawUnsafe(
    `SELECT s.shift_date, s.start_time, s.end_time, COUNT(*) AS total_count
       FROM duty_shifts s JOIN users u ON u.id = s.user_id
      WHERE s.tenant_id = ? AND s.shift_date BETWEEN ? AND ?
      GROUP BY s.shift_date, s.start_time, s.end_time
     HAVING SUM(u.role = 'DOCTOR') = 0
      ORDER BY s.shift_date ASC, s.start_time ASC`,
    BigInt(tid),
    from,
    to,
  );

  return json({ totalDays, staff, understaffedShifts });
});
