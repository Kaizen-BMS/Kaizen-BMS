import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb, prisma } from "@/lib/prismaClient";
import { serverToday, summarize } from "@/lib/attendance";

export const dynamic = "force-dynamic";

const ROLE = { HOSPITAL_ADMIN: "Admin", DOCTOR: "Doctor", NURSE: "Nurse", PHARMACIST: "Pharmacist", LAB_TECH: "Lab technician", RADIOLOGY_STAFF: "Radiology", BILLING_STAFF: "Billing", RECEPTIONIST: "Receptionist", OWNER_DOCTOR: "Owner", OWNER_PHARMACIST: "Owner", OWNER_LAB_TECH: "Owner" };

// Today's attendance for EVERYONE at this facility — people with a login and
// people without — so the front desk / admin / owner can mark all of them from
// one screen. Nobody needs a computer of their own.
export const GET = apiRoute("attendance:proxy", async (request, { session }) => {
  const workDate = await serverToday();
  const [members, users, profs] = await Promise.all([
    tenantDb.staff_members.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.users.findMany({ where: { tenant_id: BigInt(session.tenantId), active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    prisma.staff_profiles.findMany({ where: { tenant_id: BigInt(session.tenantId), photo_url: { not: null } }, select: { user_id: true, photo_url: true } }),
  ]);
  const logs = await tenantDb.attendance_logs.findMany({
    where: { work_date: workDate, OR: [{ subject_type: "STAFF_MEMBER", subject_id: { in: members.map((m) => m.id) } }, { subject_type: "USER", subject_id: { in: users.map((u) => u.id) } }] },
    include: { attendance_breaks: { orderBy: { id: "asc" } } },
  });
  const photoOf = new Map(profs.map((x) => [String(x.user_id), x.photo_url]));
  const byKey = new Map(logs.map((l) => [`${l.subject_type}:${l.subject_id}`, l]));

  const roster = [
    ...users.map((u) => ({ kind: "USER", id: Number(u.id), name: u.name, subtitle: ROLE[u.role] || u.role, photo: photoOf.get(String(u.id)) || null, log: byKey.get(`USER:${u.id}`) || null })),
    ...members.map((m) => ({ kind: "STAFF_MEMBER", id: Number(m.id), name: m.name, subtitle: m.designation || "No login", photo: m.photo_url || null, log: byKey.get(`STAFF_MEMBER:${m.id}`) || null })),
  ].map(({ log, ...p }) => ({ ...p, ...summarize(log, log?.attendance_breaks) }));
  return json({ roster });
});
