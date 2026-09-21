import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";
import { serverToday, findOpenBreak, proxySubject } from "@/lib/attendance";

export const dynamic = "force-dynamic";

const who = { userId: z.coerce.number().int().positive().optional(), staffMemberId: z.coerce.number().int().positive().optional() };
const photo = z.string().trim().min(50).max(400_000).optional();
const schema = z.object({ ...who, photoDataUrl: photo });

// Front desk / admin / owner marks ANY person in — a login user or someone with
// no login. A photo is optional (kept when given).
export const POST = apiRoute("attendance:proxy", async (request, { session }) => {
  const body = await parseBody(request, schema);
  const subj = await proxySubject(session.tenantId, body);
  if (!subj || subj.active === false) return json({ error: "not_found" }, 404);

  const workDate = await serverToday();
  const log = await tenantDb.$transaction(async (tx) => {
    const existing = await tx.attendance_logs.findFirst({ where: { subject_type: subj.type, subject_id: subj.id, work_date: workDate } });
    if (existing?.check_in_at) throw new HttpError(409, "already_checked_in");
    return tx.attendance_logs.create({
      data: { subject_type: subj.type, subject_id: subj.id, work_date: workDate, check_in_at: new Date(), check_in_photo_url: body.photoDataUrl || null, marked_by: BigInt(session.userId) },
    });
  });
  emitToTenant(session.tenantId, "attendance:updated", { log });
  return json({ log }, 201);
});
