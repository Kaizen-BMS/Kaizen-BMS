import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { hhmm, timeMin, makeShift } from "@/lib/staffSchedule";

export const dynamic = "force-dynamic";

const serialize = (t) => {
  const start = timeMin(t.start_time);
  const end = timeMin(t.end_time);
  const shift = makeShift(start, end);
  return { id: Number(t.id), name: t.name, start: hhmm(start), end: hhmm(end), hours: Math.round((shift.scheduledMinutes / 60) * 100) / 100, active: !!t.active };
};

// Reusable shifts ("General Shift 09:00–17:00") so a roster is assembled, not retyped.
export const GET = apiRoute("staffroster:read", async () => {
  const rows = await tenantDb.shift_templates.findMany({ orderBy: [{ active: "desc" }, { start_time: "asc" }] });
  return json({ templates: rows.map(serialize) });
});

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  start: z.string().trim().regex(/^\d{2}:\d{2}$/),
  end: z.string().trim().regex(/^\d{2}:\d{2}$/),
});

export const POST = apiRoute("staff:manage", async (request) => {
  const b = await parseBody(request, schema);
  if (b.start === b.end) throw new HttpError(400, "start_and_end_are_the_same");
  if (await tenantDb.shift_templates.findFirst({ where: { name: b.name }, select: { id: true } })) throw new HttpError(409, "template_already_exists");
  const t = await tenantDb.shift_templates.create({
    data: { name: b.name, start_time: new Date(`1970-01-01T${b.start}:00.000Z`), end_time: new Date(`1970-01-01T${b.end}:00.000Z`) },
  });
  return json({ template: serialize(t) }, 201);
});
