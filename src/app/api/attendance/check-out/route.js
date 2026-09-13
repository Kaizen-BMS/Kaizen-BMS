import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";
import { serverToday, findOpenBreak } from "@/lib/attendance";

export const dynamic = "force-dynamic";

export const POST = apiRoute("attendance:self", async (_request, { session }) => {
  const workDate = await serverToday();
  const userId = BigInt(session.userId);

  const existing = await tenantDb.attendance_logs.findFirst({
    where: { subject_type: "USER", subject_id: userId, work_date: workDate },
    include: { attendance_breaks: true },
  });
  if (!existing || !existing.check_in_at) throw new HttpError(409, "not_checked_in");
  if (existing.check_out_at) throw new HttpError(409, "already_checked_out");
  if (findOpenBreak(existing.attendance_breaks)) throw new HttpError(409, "close_break_first");

  const log = await tenantDb.attendance_logs.update({
    where: { id: existing.id },
    data: { check_out_at: new Date() },
  });

  emitToTenant(session.tenantId, "attendance:updated", { log });
  return json({ log });
});
