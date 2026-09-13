import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { hhmmToTimeValue } from "@/lib/appointments";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    slotMinutes: z.coerce.number().int().min(5).max(240).optional(),
    active: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "nothing to update" });

export const PATCH = apiRoute("doctorslot:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const slotId = BigInt(id);

  const existing = await tenantDb.doctor_slots.findUnique({ where: { id: slotId } });
  if (!existing) return json({ error: "not_found" }, 404);
  if (String(existing.doctor_user_id) !== String(ctx.session.userId)) {
    throw new HttpError(403, "forbidden");
  }

  const body = await parseBody(request, patchSchema);
  const patch = {};
  if (body.dayOfWeek !== undefined) patch.day_of_week = body.dayOfWeek;
  if (body.startTime !== undefined) patch.start_time = hhmmToTimeValue(body.startTime);
  if (body.endTime !== undefined) patch.end_time = hhmmToTimeValue(body.endTime);
  if (body.slotMinutes !== undefined) patch.slot_minutes = body.slotMinutes;
  if (body.active !== undefined) patch.active = body.active;

  const slot = await tenantDb.doctor_slots.update({ where: { id: slotId }, data: patch });
  return json({ slot });
});
