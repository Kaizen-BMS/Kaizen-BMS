import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { projectSlotInstances } from "@/lib/appointments";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 62; // covers Month view plus a little slack

// The one endpoint that powers Month/Week/Day views: projects each active
// doctor_slots template onto real calendar-date instances across [from,to],
// then overlays real `appointments` rows. Appointments are unioned in (not
// just matched against projected instances) so a booking still shows up
// even if the underlying slot template was later changed/deactivated —
// the booking is a historical fact regardless of today's template.
export const GET = apiRoute("appointment:read", async (request, { session }) => {
  const url = new URL(request.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const doctorIdParam = url.searchParams.get("doctorId");
  if (!fromStr || !toStr) {
    return json({ error: "from and to (YYYY-MM-DD) are required" }, 400);
  }

  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return json({ error: "invalid date range" }, 400);
  }
  if (Math.round((to - from) / DAY_MS) > MAX_RANGE_DAYS) {
    return json({ error: `range too large (max ${MAX_RANGE_DAYS} days)` }, 400);
  }

  const doctorWhere = doctorIdParam
    ? { doctor_user_id: BigInt(doctorIdParam) }
    : session.role === "DOCTOR" || session.role === "OWNER_DOCTOR"
      ? { doctor_user_id: BigInt(session.userId) }
      : {};

  const slotTemplates = await tenantDb.doctor_slots.findMany({ where: { ...doctorWhere, active: true } });
  const instances = projectSlotInstances(slotTemplates, from, to);

  const toExclusive = new Date(to.getTime() + DAY_MS);
  const appts = await tenantDb.appointments.findMany({
    where: { ...doctorWhere, slot_time: { gte: from, lt: toExclusive }, status: { not: "CANCELLED" } },
    include: { patients: { select: { name: true, age: true } } },
  });

  const merged = new Map();
  for (const inst of instances) {
    const key = `${inst.doctorUserId}|${inst.slotTime.getTime()}`;
    merged.set(key, { doctorUserId: Number(inst.doctorUserId), slotTime: inst.slotTime, appointment: null });
  }
  for (const appt of appts) {
    const key = `${appt.doctor_user_id}|${appt.slot_time.getTime()}`;
    merged.set(key, {
      doctorUserId: Number(appt.doctor_user_id),
      slotTime: appt.slot_time,
      appointment: {
        id: Number(appt.id),
        status: appt.status,
        bookedBy: appt.booked_by,
        reason: appt.reason,
        patientId: Number(appt.patient_id),
        patientName: appt.patients.name,
        patientAge: appt.patients.age,
      },
    });
  }

  const result = [...merged.values()].sort(
    (a, b) => a.slotTime - b.slotTime || a.doctorUserId - b.doctorUserId,
  );
  return json({ slots: result });
});
