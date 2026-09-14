import { patientApiRoute, json, HttpError } from "@/lib/patientApiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { emitToModule } from "@/lib/realtime";
import { resolveOwnPatientIds } from "@/lib/patientPortal";

export const dynamic = "force-dynamic";

// Cancelling targets one specific, already-patient-owned appointment by id
// — unlike booking/feedback there's no "which patient is this for"
// ambiguity to resolve (the appointment itself already belongs to exactly
// one patient); the check here is ownership, not selection: the
// appointment's patient_id must be one of THIS session's own profiles.
export const POST = patientApiRoute(async (_request, ctx) => {
  const { id } = await ctx.params;
  const appointmentId = BigInt(id);
  const { session } = ctx;

  const ownIds = await resolveOwnPatientIds(session.phone);
  const appointment = await tenantDb.appointments.findUnique({ where: { id: appointmentId } });
  if (!appointment || !ownIds.some((pid) => pid === appointment.patient_id)) {
    return json({ error: "not_found" }, 404);
  }
  if (appointment.status === "CANCELLED" || appointment.status === "COMPLETED" || appointment.status === "NO_SHOW") {
    throw new HttpError(409, "already_finalized");
  }

  const updated = await tenantDb.appointments.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
  });

  emitToModule(session.tenantId, "APPOINTMENTS", "appointment:cancelled", { appointmentId: Number(updated.id) });
  return json({ ok: true });
});
