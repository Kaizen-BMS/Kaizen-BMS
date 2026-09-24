import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { prisma, tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { computeWorkedMinutes } from "@/lib/attendance";
import { loadScheduleResolver, dayMetrics, dateKey } from "@/lib/staffSchedule";

export const dynamic = "force-dynamic";

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

// Attendance history for owner/admin: what was planned, what really happened, and the difference —
// late, worked, shortfall, overtime — all calculated from the check-in/out times against the schedule.
export const GET = apiRoute("staff:manage", async (request) => {
  const sp = new URL(request.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!isDate(from) || !isDate(to)) throw new HttpError(400, "from_and_to_required");
  if ((new Date(to) - new Date(from)) / 86400000 > 92) throw new HttpError(400, "range_too_large");
  const userId = sp.get("userId");
  const tid = requireTenantId();

  const logs = await tenantDb.attendance_logs.findMany({
    where: {
      work_date: { gte: new Date(from), lte: new Date(to) },
      ...(userId ? { subject_type: "USER", subject_id: BigInt(userId) } : {}),
    },
    include: { attendance_breaks: true },
    orderBy: [{ work_date: "desc" }, { id: "desc" }],
    take: 1500,
  });
  const userIds = [...new Set(logs.filter((l) => l.subject_type === "USER").map((l) => l.subject_id))];
  const memberIds = [...new Set(logs.filter((l) => l.subject_type === "STAFF_MEMBER").map((l) => l.subject_id))];
  const [users, members, resolve] = await Promise.all([
    userIds.length ? prisma.users.findMany({ where: { id: { in: userIds }, tenant_id: BigInt(tid) }, select: { id: true, name: true, role: true } }) : [],
    memberIds.length ? tenantDb.staff_members.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true } }) : [],
    loadScheduleResolver(tid, from, to),
  ]);
  const uName = new Map(users.map((u) => [String(u.id), u]));
  const mName = new Map(members.map((m) => [String(m.id), m.name]));

  const rows = logs.map((l) => {
    const isUser = l.subject_type === "USER";
    const day = dateKey(l.work_date);
    const shift = isUser ? resolve(String(l.subject_id), day) : null;
    const worked = computeWorkedMinutes(l, l.attendance_breaks);
    const m = dayMetrics(shift, { checkIn: l.check_in_at, checkOut: l.check_out_at, workedMinutes: worked });
    return {
      id: Number(l.id),
      subjectType: l.subject_type,
      userId: isUser ? Number(l.subject_id) : null,
      name: isUser ? uName.get(String(l.subject_id))?.name || "—" : mName.get(String(l.subject_id)) || "—",
      role: isUser ? uName.get(String(l.subject_id))?.role || null : null,
      date: day,
      scheduledStart: shift && !shift.off ? shift.start : null,
      scheduledEnd: shift && !shift.off ? shift.end : null,
      offDay: !!shift?.off,
      checkIn: l.check_in_at,
      checkOut: l.check_out_at,
      hasInPhoto: !!l.check_in_photo_url,
      hasOutPhoto: !!l.check_out_photo_url,
      proxy: String(l.marked_by) !== String(l.subject_id) || !isUser,
      open: !!l.check_in_at && !l.check_out_at,
      ...m,
    };
  });
  return json({ rows });
});
