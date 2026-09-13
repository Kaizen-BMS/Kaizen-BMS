import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { serverToday, summarize } from "@/lib/attendance";

export const dynamic = "force-dynamic";

// Today's status for every active no-login staff member — the receptionist's
// roster for marking proxy attendance.
export const GET = apiRoute("attendance:proxy", async () => {
  const workDate = await serverToday();
  const members = await tenantDb.staff_members.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  if (members.length === 0) return json({ roster: [] });

  const logs = await tenantDb.attendance_logs.findMany({
    where: {
      subject_type: "STAFF_MEMBER",
      subject_id: { in: members.map((m) => m.id) },
      work_date: workDate,
    },
    include: { attendance_breaks: { orderBy: { id: "asc" } } },
  });
  const byId = new Map(logs.map((l) => [String(l.subject_id), l]));

  const roster = members.map((member) => {
    const log = byId.get(String(member.id)) || null;
    return { member, ...summarize(log, log?.attendance_breaks) };
  });
  return json({ roster });
});
