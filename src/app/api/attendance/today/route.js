import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { serverToday, summarize } from "@/lib/attendance";

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
  return json(summarize(log, breaks));
});
