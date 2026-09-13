import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";
import { serverToday } from "@/lib/attendance";

export const dynamic = "force-dynamic";

export const POST = apiRoute("attendance:self", async (_request, { session }) => {
  const workDate = await serverToday();
  const userId = BigInt(session.userId);

  const log = await tenantDb.$transaction(async (tx) => {
    const existing = await tx.attendance_logs.findFirst({
      where: { subject_type: "USER", subject_id: userId, work_date: workDate },
    });
    if (existing?.check_in_at) throw new HttpError(409, "already_checked_in");
    return tx.attendance_logs.create({
      data: {
        subject_type: "USER",
        subject_id: userId,
        work_date: workDate,
        check_in_at: new Date(),
        marked_by: userId,
      },
    });
  });

  emitToTenant(session.tenantId, "attendance:updated", { log });
  return json({ log }, 201);
});
