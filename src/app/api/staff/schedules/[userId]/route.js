import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { hhmm, timeMin, saveWeeklySchedule, logHistory } from "@/lib/staffSchedule";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

async function userOf(session, userId) {
  return prisma.users.findFirst({ where: { id: BigInt(userId), tenant_id: BigInt(session.tenantId) }, select: { id: true, name: true } });
}

// Everyone with a login can see the weekly pattern (shift coordination); only staff:manage edits it.
export const GET = apiRoute("staffroster:read", async (_request, { session, params }) => {
  const { userId } = await params;
  if (!(await userOf(session, userId))) return json({ error: "not_found" }, 404);
  const rows = await prisma.staff_schedules.findMany({ where: { tenant_id: BigInt(session.tenantId), user_id: BigInt(userId) }, orderBy: { day_of_week: "asc" } });
  const byDow = new Map(rows.map((r) => [r.day_of_week, r]));
  const days = [0, 1, 2, 3, 4, 5, 6].map((dow) => {
    const r = byDow.get(dow);
    const on = r && !r.is_off && r.start_time && r.end_time;
    return { dow, off: !on, start: on ? hhmm(timeMin(r.start_time)) : null, end: on ? hhmm(timeMin(r.end_time)) : null, configured: !!r };
  });
  return json({ days });
});

const putSchema = z.object({
  days: z
    .array(
      z.object({
        dow: z.coerce.number().int().min(0).max(6),
        off: z.coerce.boolean().optional().default(false),
        start: z.string().trim().regex(/^\d{2}:\d{2}$/).nullable().optional(),
        end: z.string().trim().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      }),
    )
    .length(7),
});

export const PUT = apiRoute("staff:manage", async (request, { session, params }) => {
  const { userId } = await params;
  const u = await userOf(session, userId);
  if (!u) return json({ error: "not_found" }, 404);
  const body = await parseBody(request, putSchema);
  await saveWeeklySchedule(session.tenantId, userId, body.days);
  const summary = body.days.map((d) => (d.off || !d.start || !d.end ? "off" : `${d.start}-${d.end}`)).join(" / ");
  await logHistory(session.tenantId, userId, "ROSTER_CHANGED", `Weekly schedule (Sun→Sat): ${summary}`, session.userId);
  emitToTenant(session.tenantId, "dutyshift:created", { userId: Number(userId) });
  return json({ ok: true });
});
