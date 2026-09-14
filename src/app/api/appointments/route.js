import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb, prisma } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";
import { emitToModule } from "@/lib/realtime";
import { bookAppointment } from "@/lib/appointments";

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

// Book a slot on behalf of a patient (front desk / doctor). Double-booking
// prevention lives in the shared bookAppointment() — see its comment for
// why this is a unique-constraint insert race, not a FOR UPDATE lock.
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

  const result = await bookAppointment(tenantDb, {
    doctorUserId,
    slotTime,
    patientId: body.patientId ? BigInt(body.patientId) : null,
    newPatient: { name: body.name, age: body.age, phone: body.phone },
    reason: body.reason,
    bookedBy: "staff",
  });
  if (!result.ok) throw new HttpError(result.status, result.error);

  const appointment = await tenantDb.appointments.findUnique({
    where: { id: result.appointmentId },
    include: { patients: { select: { name: true, age: true, phone: true } } },
  });

  emitToModule(session.tenantId, "APPOINTMENTS", "appointment:booked", { appointment });
  return json({ appointment }, 201);
});
