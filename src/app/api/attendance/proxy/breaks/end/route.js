import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";
import { serverToday, findOpenBreak } from "@/lib/attendance";

export const dynamic = "force-dynamic";

const schema = z.object({ staffMemberId: z.coerce.number().int().positive() });

export const POST = apiRoute("attendance:proxy", async (request, { session }) => {
  const body = await parseBody(request, schema);

  const member = await tenantDb.staff_members.findUnique({ where: { id: BigInt(body.staffMemberId) } });
  if (!member) return json({ error: "not_found" }, 404);

  const workDate = await serverToday();
  const log = await tenantDb.attendance_logs.findFirst({
    where: { subject_type: "STAFF_MEMBER", subject_id: member.id, work_date: workDate },
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
