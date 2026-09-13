import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";
import { serverToday, findOpenBreak } from "@/lib/attendance";

export const dynamic = "force-dynamic";

const schema = z.object({
  staffMemberId: z.coerce.number().int().positive(),
  photoDataUrl: z.string().trim().min(50).max(400_000),
});

export const POST = apiRoute("attendance:proxy", async (request, { session }) => {
  const body = await parseBody(request, schema);

  const member = await tenantDb.staff_members.findUnique({ where: { id: BigInt(body.staffMemberId) } });
  if (!member) return json({ error: "not_found" }, 404);

  const workDate = await serverToday();
  const existing = await tenantDb.attendance_logs.findFirst({
    where: { subject_type: "STAFF_MEMBER", subject_id: member.id, work_date: workDate },
    include: { attendance_breaks: true },
  });
  if (!existing || !existing.check_in_at) throw new HttpError(409, "not_checked_in");
  if (existing.check_out_at) throw new HttpError(409, "already_checked_out");
  if (findOpenBreak(existing.attendance_breaks)) throw new HttpError(409, "close_break_first");

  const log = await tenantDb.attendance_logs.update({
    where: { id: existing.id },
    data: { check_out_at: new Date(), check_out_photo_url: body.photoDataUrl },
  });

  emitToTenant(session.tenantId, "attendance:updated", { log });
  return json({ log });
});
