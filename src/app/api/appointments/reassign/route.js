import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb, prisma } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";
import { slotTimeIsValid } from "@/lib/appointments";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    toDoctorId: z.coerce.number().int().positive(),
    // Either one appointment …
    appointmentId: z.coerce.number().int().positive().optional(),
    // … or everything one doctor has on a date (doctor absent that day).
    fromDoctorId: z.coerce.number().int().positive().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((b) => b.appointmentId || (b.fromDoctorId && b.date), { message: "appointmentId or fromDoctorId + date required" });

// Doctor not available? Hand their appointments to another doctor at the SAME
// time. Only moves where the other doctor actually works that time and it is
// free; everything else stays as it was and is listed so the desk can rebook it.
export const POST = apiRoute("appointment:update", async (request, { session }) => {
  const body = await parseBody(request, schema);
  const tid = BigInt(session.tenantId);
  const target = await prisma.users.findFirst({ where: { id: BigInt(body.toDoctorId), tenant_id: tid, role: { in: ["DOCTOR", "OWNER_DOCTOR"] } }, select: { id: true, name: true } });
  if (!target) throw new HttpError(404, "doctor_not_found");

  let appts;
  if (body.appointmentId) {
    appts = await tenantDb.appointments.findMany({ where: { id: BigInt(body.appointmentId), status: { in: ["BOOKED", "CONFIRMED"] } }, include: { patients: { select: { name: true } } } });
  } else {
    const day = new Date(`${body.date}T00:00:00`);
    appts = await tenantDb.appointments.findMany({
      where: { doctor_user_id: BigInt(body.fromDoctorId), slot_time: { gte: day, lt: new Date(day.getTime() + 86400000) }, status: { in: ["BOOKED", "CONFIRMED"] } },
      include: { patients: { select: { name: true } } },
      orderBy: { slot_time: "asc" },
    });
  }
  if (appts.length === 0) return json({ moved: 0, conflicts: [] });

  const slots = await tenantDb.doctor_slots.findMany({ where: { doctor_user_id: target.id, active: true } });
  let moved = 0;
  const conflicts = [];
  for (const a of appts) {
    const label = { id: Number(a.id), patient: a.patients.name, slotTime: a.slot_time };
    if (String(a.doctor_user_id) === String(target.id)) continue;
    if (!slotTimeIsValid(slots, target.id, a.slot_time)) {
      conflicts.push({ ...label, reason: `${target.name} does not work at that time` });
      continue;
    }
    try {
      await tenantDb.appointments.update({ where: { id: a.id }, data: { doctor_user_id: target.id } });
      moved++;
    } catch (err) {
      if (err && err.code === "P2002") conflicts.push({ ...label, reason: `${target.name} already has someone at that time` });
      else throw err;
    }
  }
  if (moved > 0) emitToModule(session.tenantId, "APPOINTMENTS", "appointment:updated", { moved });
  return json({ moved, conflicts, to: target.name });
});
