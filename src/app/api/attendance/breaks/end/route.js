import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";
import { serverToday, findOpenBreak } from "@/lib/attendance";

export const dynamic = "force-dynamic";

export const POST = apiRoute("attendance:self", async (_request, { session }) => {
  const workDate = await serverToday();
  const userId = BigInt(session.userId);

  const log = await tenantDb.attendance_logs.findFirst({
    where: { subject_type: "USER", subject_id: userId, work_date: workDate },
    include: { attendance_breaks: true },
  });
  const openBreak = findOpenBreak(log?.attendance_breaks);
  if (!openBreak) throw new HttpError(409, "not_out");

  const brk = await tenantDb.attendance_breaks.update({
    where: { id: openBreak.id },
    data: { in_at: new Date() },
  });

  emitToTenant(session.tenantId, "attendance:updated", { log });
  return json({ break: brk });
});
