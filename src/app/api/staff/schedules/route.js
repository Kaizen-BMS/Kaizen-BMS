import { apiRoute, json } from "@/lib/apiRoute";
import { prisma } from "@/lib/prismaClient";
import { hhmm, timeMin } from "@/lib/staffSchedule";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["HOSPITAL_ADMIN", "DOCTOR", "NURSE", "PHARMACIST", "LAB_TECH", "BILLING_STAFF", "RECEPTIONIST", "RADIOLOGY_STAFF"];

// Everyone's weekly pattern at a glance (Sun→Sat) — ordinary shift-coordination information.
export const GET = apiRoute("staffroster:read", async (_request, { session }) => {
  const tid = BigInt(session.tenantId);
  const [users, rows] = await Promise.all([
    prisma.users.findMany({ where: { tenant_id: tid, active: true, role: { in: STAFF_ROLES } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    prisma.staff_schedules.findMany({ where: { tenant_id: tid } }),
  ]);
  const by = new Map(rows.map((r) => [`${r.user_id}:${r.day_of_week}`, r]));
  return json({
    staff: users.map((u) => ({
      userId: Number(u.id),
      name: u.name,
      role: u.role,
      days: [0, 1, 2, 3, 4, 5, 6].map((dow) => {
        const r = by.get(`${u.id}:${dow}`);
        const on = r && !r.is_off && r.start_time && r.end_time;
        return { dow, off: !on, start: on ? hhmm(timeMin(r.start_time)) : null, end: on ? hhmm(timeMin(r.end_time)) : null, configured: !!r };
      }),
    })),
  });
});
