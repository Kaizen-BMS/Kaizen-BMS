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
import { serverToday, findOpenBreak } from "@/lib/attendance";

export const dynamic = "force-dynamic";

export const POST = apiRoute("attendance:self", async (request, { session }) => {
  const photo = await readPhoto(request);
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
    data: { check_out_at: new Date(), ...(photo ? { check_out_photo_url: photo } : {}) },
  });

  emitToTenant(session.tenantId, "attendance:updated", { log });
  return json({ log });
});
