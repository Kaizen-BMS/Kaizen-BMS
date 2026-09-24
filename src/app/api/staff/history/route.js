import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { prisma, tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { computeWorkedMinutes } from "@/lib/attendance";
import { loadScheduleResolver, dayMetrics, dateKey, ddmmyy } from "@/lib/staffSchedule";

export const dynamic = "force-dynamic";

// One person's complete timeline, newest first: duty/roster changes, leave and its approval,
// every attendance day (late / early leave / overtime / proxy). Admin/owner only.
export const GET = apiRoute("staff:manage", async (request) => {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!/^\d{1,18}$/.test(userId || "")) throw new HttpError(400, "userId_required");
  const tid = requireTenantId();
  const uid = BigInt(userId);
  const user = await prisma.users.findFirst({ where: { id: uid, tenant_id: BigInt(tid) }, select: { name: true } });
  if (!user) throw new HttpError(404, "not_found");

  const since = new Date();
  since.setDate(since.getDate() - 120);
  const sinceStr = since.toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  const [events, leaves, logs, resolve] = await Promise.all([
    tenantDb.staff_history.findMany({ where: { user_id: uid }, orderBy: { created_at: "desc" }, take: 200 }),
    tenantDb.leave_requests.findMany({ where: { user_id: uid }, orderBy: { id: "desc" }, take: 60 }),
    tenantDb.attendance_logs.findMany({ where: { subject_type: "USER", subject_id: uid, work_date: { gte: since } }, include: { attendance_breaks: true }, orderBy: { work_date: "desc" } }),
    loadScheduleResolver(tid, sinceStr, todayStr),
  ]);

  const timeline = [];
  for (const e of events) timeline.push({ at: e.created_at, type: e.event_type, text: e.detail || e.event_type });
  for (const l of leaves) {
    timeline.push({ at: l.created_at || l.from_date, type: "LEAVE", text: `Leave ${ddmmyy(l.from_date)} → ${ddmmyy(l.to_date)} — ${l.status.toLowerCase()}` });
  }
  for (const l of logs) {
    const shift = resolve(String(uid), dateKey(l.work_date));
    const m = dayMetrics(shift, { checkIn: l.check_in_at, checkOut: l.check_out_at, workedMinutes: computeWorkedMinutes(l, l.attendance_breaks) });
    const bits = [];
    if (m.lateMinutes > 0) bits.push(`late ${m.lateMinutes}m`);
    if (m.earlyLeaveMinutes > 0 && l.check_out_at) bits.push(`left ${m.earlyLeaveMinutes}m early`);
    if (m.overtimeMinutes > 0) bits.push(`overtime ${m.overtimeMinutes}m`);
    if (String(l.marked_by) !== String(uid)) bits.push("marked by someone else");
    timeline.push({ at: l.check_in_at || l.work_date, type: "ATTENDANCE", text: `Attendance ${ddmmyy(l.work_date)}${bits.length ? ` — ${bits.join(", ")}` : " — on time"}` });
  }
  timeline.sort((a, b) => new Date(b.at) - new Date(a.at));
  return json({ name: user.name, timeline: timeline.slice(0, 300) });
});
