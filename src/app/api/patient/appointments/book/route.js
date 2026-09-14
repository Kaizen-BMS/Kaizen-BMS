import { z } from "zod";
import { patientApiRoute, json, HttpError } from "@/lib/patientApiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb, prisma } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";
import { bookAppointment } from "@/lib/appointments";
import { ownsPatient } from "@/lib/patientPortal";
import { isModuleActive } from "@/lib/modules";

export const dynamic = "force-dynamic";

// `patientId` is REQUIRED here, unlike the staff booking route — a patient
// session already represents one or more EXISTING profiles under this
// phone number (see /api/patient/profiles), so "which patient is this for"
// must always be explicit, never defaulted, exactly as it works for every
// read screen (resolvePatientIdFilter). There is no "new patient" option on
// this path: a self-service booking can only be made for a profile that
// already exists under this session's own phone, never an arbitrary name.
const bookSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  doctorUserId: z.coerce.number().int().positive(),
  slotTime: z.string().min(10),
  reason: z.string().trim().max(500).optional().default(""),
});

export const POST = patientApiRoute(async (request, { session }) => {
  const active = await isModuleActive(session.tenantId, "APPOINTMENTS");
  if (!active) throw new HttpError(403, "module_not_active");

  const body = await parseBody(request, bookSchema);
  const patientId = await ownsPatient(session.phone, body.patientId);
  if (!patientId) throw new HttpError(403, "not_your_profile");

  const doctorUserId = BigInt(body.doctorUserId);
  const slotTime = new Date(body.slotTime);
  if (Number.isNaN(slotTime.getTime())) return json({ error: "invalid_slot_time" }, 400);

  const doctor = await prisma.users.findFirst({
    where: { id: doctorUserId, tenant_id: BigInt(session.tenantId), role: "DOCTOR" },
  });
  if (!doctor) return json({ error: "doctor_not_found" }, 404);

  const result = await bookAppointment(tenantDb, {
    doctorUserId,
    slotTime,
    patientId,
    reason: body.reason,
    bookedBy: "patient",
  });
  if (!result.ok) throw new HttpError(result.status, result.error);

  emitToModule(session.tenantId, "APPOINTMENTS", "appointment:booked", { appointmentId: Number(result.appointmentId) });
  return json({ appointmentId: Number(result.appointmentId) }, 201);
});
