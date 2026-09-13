import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb, prisma } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToModule } from "@/lib/realtime";
import { slotTimeIsValid } from "@/lib/appointments";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    doctorUserId: z.coerce.number().int().positive(),
    slotTime: z.string().min(10),
    reason: z.string().trim().max(500).optional().default(""),
    patientId: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(1).max(191).optional(),
    age: z.coerce.number().int().min(0).max(150).optional(),
    phone: z.string().trim().min(3).max(32).optional(),
  })
  .refine((b) => b.patientId || (b.name && b.phone), {
    message: "provide patientId or a new patient's name + phone",
  });

// Book a slot. Double-booking prevention is NOT a manual FOR UPDATE lock
// (see migrations/016's comment on `active_slot_time` for why that pattern
// doesn't apply to a brand-new row) — it's the real unique constraint on
// appointments, with a P2002 violation translated to 409 here. Whichever
// concurrent request's INSERT commits first wins; the other fails cleanly
// and atomically, at the storage-engine level, not in application code.
export const POST = apiRoute("appointment:create", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const doctorUserId = BigInt(body.doctorUserId);
  const slotTime = new Date(body.slotTime);
  if (Number.isNaN(slotTime.getTime())) return json({ error: "invalid_slot_time" }, 400);

  const tid = requireTenantId();
  const doctor = await prisma.users.findFirst({
    where: { id: doctorUserId, tenant_id: BigInt(tid), role: "DOCTOR" },
  });
  if (!doctor) return json({ error: "doctor_not_found" }, 404);

  const slots = await tenantDb.doctor_slots.findMany({ where: { doctor_user_id: doctorUserId, active: true } });
  if (!slotTimeIsValid(slots, doctorUserId, slotTime)) {
    return json({ error: "slot_not_available" }, 400);
  }

  let appointmentId;
  try {
    appointmentId = await tenantDb.$transaction(async (tx) => {
      let patientId = body.patientId ? BigInt(body.patientId) : null;
      if (patientId) {
        const existing = await tx.patients.findUnique({ where: { id: patientId } });
        if (!existing) throw new HttpError(404, "patient_not_found");
      } else {
        const p = await tx.patients.create({
          data: { name: body.name, age: body.age ?? null, phone: body.phone },
        });
        patientId = p.id;
      }
      const appt = await tx.appointments.create({
        data: {
          patient_id: patientId,
          doctor_user_id: doctorUserId,
          slot_time: slotTime,
          booked_by: "staff",
          reason: body.reason || null,
        },
      });
      return appt.id;
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err?.code === "P2002") throw new HttpError(409, "slot_taken");
    throw err;
  }

  const appointment = await tenantDb.appointments.findUnique({
    where: { id: appointmentId },
    include: { patients: { select: { name: true, age: true, phone: true } } },
  });

  emitToModule(session.tenantId, "APPOINTMENTS", "appointment:booked", { appointment });
  return json({ appointment }, 201);
});
