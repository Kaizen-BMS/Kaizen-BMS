import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";
import { logHistory, OFFSET_MIN, ddmmyy } from "@/lib/staffSchedule";

export const dynamic = "force-dynamic";

// A correction is an admin/owner fixing a wrong or forgotten time. It always needs a reason and is
// written to the person's staff history (who changed what, when) — the original times are quoted there.
const hhmm = z.string().trim().regex(/^\d{2}:\d{2}$/);
const schema = z.object({ checkIn: hhmm.optional(), checkOut: hhmm.optional(), reason: z.string().trim().min(3).max(200) })
  .refine((b) => b.checkIn || b.checkOut, { message: "nothing to correct" });

// "HH:MM" facility wall-clock on the log's own work date -> the real instant.
function instant(workDate, hm) {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(workDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - OFFSET_MIN * 60000);
}
const show = (d) => (d ? new Date(new Date(d).getTime() + OFFSET_MIN * 60000).toISOString().slice(11, 16) : "—");

export const PATCH = apiRoute("staff:manage", async (request, { session, params }) => {
  const { id } = await params;
  const log = await tenantDb.attendance_logs.findUnique({ where: { id: BigInt(id) } });
  if (!log) throw new HttpError(404, "not_found");
  const b = await parseBody(request, schema);

  const newIn = b.checkIn ? instant(log.work_date, b.checkIn) : log.check_in_at;
  let newOut = b.checkOut ? instant(log.work_date, b.checkOut) : log.check_out_at;
  if (newIn && newOut && newOut <= newIn) newOut = new Date(newOut.getTime() + 86400000); // night shift ends next day
  if (!newIn) throw new HttpError(400, "check_in_required");

  const updated = await tenantDb.attendance_logs.update({ where: { id: log.id }, data: { check_in_at: newIn, check_out_at: newOut } });
  if (log.subject_type === "USER") {
    await logHistory(session.tenantId, log.subject_id, "ATTENDANCE_CORRECTED",
      `${ddmmyy(log.work_date)}: in ${show(log.check_in_at)}→${show(newIn)}, out ${show(log.check_out_at)}→${show(newOut)}. Reason: ${b.reason}`, session.userId);
  }
  emitToTenant(session.tenantId, "attendance:updated", { log: updated });
  return json({ ok: true });
});
