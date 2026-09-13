import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";
import { serverToday } from "@/lib/attendance";

export const dynamic = "force-dynamic";

// A receptionist marks a no-login staff member "in" on their behalf. A photo
// is required — it's the only identity check available for someone who has
// no login of their own, so it isn't optional here the way it's absent from
// the self-service check-in. Kept as a client-captured, resized data URL
// (see AttendanceClient.jsx) — this project has no file/blob storage
// infrastructure yet, and a compressed snapshot fits comfortably in a
// MEDIUMTEXT column without inventing one for this feature alone.
const schema = z.object({
  staffMemberId: z.coerce.number().int().positive(),
  photoDataUrl: z.string().trim().min(50).max(400_000),
});

export const POST = apiRoute("attendance:proxy", async (request, { session }) => {
  const body = await parseBody(request, schema);

  const member = await tenantDb.staff_members.findUnique({ where: { id: BigInt(body.staffMemberId) } });
  if (!member || !member.active) return json({ error: "not_found" }, 404);

  const workDate = await serverToday();
  const markedBy = BigInt(session.userId);

  const log = await tenantDb.$transaction(async (tx) => {
    const existing = await tx.attendance_logs.findFirst({
      where: { subject_type: "STAFF_MEMBER", subject_id: member.id, work_date: workDate },
    });
    if (existing?.check_in_at) throw new HttpError(409, "already_checked_in");
    return tx.attendance_logs.create({
      data: {
        subject_type: "STAFF_MEMBER",
        subject_id: member.id,
        work_date: workDate,
        check_in_at: new Date(),
        check_in_photo_url: body.photoDataUrl,
        marked_by: markedBy,
      },
    });
  });

  emitToTenant(session.tenantId, "attendance:updated", { log });
  return json({ log }, 201);
});
