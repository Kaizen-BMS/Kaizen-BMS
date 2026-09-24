import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { serverToday, summarize } from "@/lib/attendance";
import { requireTenantId } from "@/lib/requestContext";
import { loadScheduleResolver, dayMetrics, dateKey } from "@/lib/staffSchedule";

export const dynamic = "force-dynamic";

// The caller's own attendance for today — self-service only (see
// /api/attendance/proxy for a receptionist viewing/marking someone else's).
export const GET = apiRoute("attendance:self", async (_request, { session }) => {
  const workDate = await serverToday();
  const log = await tenantDb.attendance_logs.findFirst({
    where: { subject_type: "USER", subject_id: BigInt(session.userId), work_date: workDate },
    include: { attendance_breaks: { orderBy: { id: "asc" } } },
  });
  const breaks = log?.attendance_breaks || [];
  const day = dateKey(workDate);
  const shift = (await loadScheduleResolver(requireTenantId(), day, day))(String(session.userId), day);
  const sum = summarize(log, breaks);
  const metrics = dayMetrics(shift, { checkIn: log?.check_in_at, checkOut: log?.check_out_at, workedMinutes: sum.workedMinutes });
  return json({ ...sum, schedule: shift && !shift.off ? { start: shift.start, end: shift.end, minutes: shift.scheduledMinutes } : shift?.off ? { off: true } : null, metrics });
});
