import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { z } from "zod";

const photoSchema = z.object({ photoDataUrl: z.string().trim().min(50).max(400_000).regex(/^data:image\/(jpeg|png|webp);base64,/).optional() });
async function readPhoto(request) {
  const body = await request.json().catch(() => ({}));
  const parsed = photoSchema.safeParse(body || {});
  return parsed.success ? parsed.data.photoDataUrl : undefined;
}

import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";
import { serverToday, reopenDay } from "@/lib/attendance";

export const dynamic = "force-dynamic";

export const POST = apiRoute("attendance:self", async (request, { session }) => {
  const photo = await readPhoto(request);
  const workDate = await serverToday();
  const userId = BigInt(session.userId);

  const log = await tenantDb.$transaction(async (tx) => {
    const existing = await tx.attendance_logs.findFirst({
      where: { subject_type: "USER", subject_id: userId, work_date: workDate },
    });
    if (existing?.check_in_at && !existing.check_out_at) throw new HttpError(409, "already_checked_in");
    if (existing?.check_out_at) return reopenDay(tx, existing, photo);
    return tx.attendance_logs.create({
      data: {
        subject_type: "USER",
        subject_id: userId,
        work_date: workDate,
        check_in_at: new Date(),
        check_in_photo_url: photo || null,
        marked_by: userId,
      },
    });
  });

  emitToTenant(session.tenantId, "attendance:updated", { log });
  return json({ log }, 201);
});
