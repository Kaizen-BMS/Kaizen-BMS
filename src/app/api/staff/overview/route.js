import { apiRoute, json } from "@/lib/apiRoute";
import { prisma, tenantDb } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { serverToday, computeWorkedMinutes } from "@/lib/attendance";
import { loadScheduleResolver, dayMetrics, dateKey } from "@/lib/staffSchedule";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["HOSPITAL_ADMIN", "DOCTOR", "NURSE", "PHARMACIST", "LAB_TECH", "BILLING_STAFF", "RECEPTIONIST", "RADIOLOGY_STAFF"];

// Owner/admin overview for today: who is present, absent, late, on leave, on overtime.
// "Absent" only applies to someone who was actually expected today (has a duty for today) —
// an owner or manager with no schedule is never forced into employee attendance.
export const GET = apiRoute("staff:manage", async () => {
  const tid = requireTenantId();
  const today = await serverToday();
  const day = dateKey(today);

  const [users, members, logs, leaves, resolve] = await Promise.all([
    prisma.users.findMany({ where: { tenant_id: BigInt(tid), active: true, role: { in: STAFF_ROLES } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    tenantDb.staff_members.findMany({ where: { active: true }, select: { id: true, name: true, designation: true }, orderBy: { name: "asc" } }),
    tenantDb.attendance_logs.findMany({ where: { work_date: today }, include: { attendance_breaks: true } }),
    tenantDb.leave_requests.findMany({ where: { status: "APPROVED", from_date: { lte: today }, to_date: { gte: today } }, select: { user_id: true } }),
    loadScheduleResolver(tid, day, day),
  ]);
  const logOf = new Map(logs.map((l) => [`${l.subject_type}:${l.subject_id}`, l]));
  const onLeave = new Set(leaves.map((l) => String(l.user_id)));

  const people = [
    ...users.map((u) => ({ kind: "USER", id: Number(u.id), name: u.name, role: u.role, key: `USER:${u.id}`, uid: String(u.id) })),
    ...members.map((m) => ({ kind: "STAFF_MEMBER", id: Number(m.id), name: m.name, role: m.designation || "No login", key: `STAFF_MEMBER:${m.id}`, uid: null })),
  ].map((p) => {
    const log = logOf.get(p.key);
    const shift = p.uid ? resolve(p.uid, day) : null;
    const present = !!log?.check_in_at;
    const leave = !!p.uid && onLeave.has(p.uid);
    const worked = log ? computeWorkedMinutes(log, log.attendance_breaks) : 0;
    const m = dayMetrics(shift, { checkIn: log?.check_in_at, checkOut: log?.check_out_at, workedMinutes: worked });
    const expected = p.kind === "STAFF_MEMBER" ? true : !!shift && !shift.off;
    let status = "OFF";
    if (present) status = "PRESENT";
    else if (leave) status = "ON_LEAVE";
    else if (expected) status = "ABSENT";
    return {
      kind: p.kind, id: p.id, name: p.name, role: p.role, status,
      late: present && m.lateMinutes > 0, lateMinutes: m.lateMinutes,
      overtime: !!log?.check_out_at && m.overtimeMinutes > 0, overtimeMinutes: m.overtimeMinutes,
      checkIn: log?.check_in_at || null, checkOut: log?.check_out_at || null,
      duty: shift && !shift.off ? `${shift.start}–${shift.end}` : shift?.off ? "Off today" : "Not scheduled",
    };
  });

  const count = (fn) => people.filter(fn).length;
  return json({
    date: day,
    counts: {
      total: people.length,
      present: count((p) => p.status === "PRESENT"),
      absent: count((p) => p.status === "ABSENT"),
      late: count((p) => p.late),
      onLeave: count((p) => p.status === "ON_LEAVE"),
      overtime: count((p) => p.overtime),
    },
    people,
  });
});
