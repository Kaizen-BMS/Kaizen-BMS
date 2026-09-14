import { patientApiRoute, json } from "@/lib/patientApiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { isModuleActive } from "@/lib/modules";
import { projectSlotInstances } from "@/lib/appointments";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 31; // a patient books ahead, not months out — narrower than the staff calendar's 62

// The privacy-restricted twin of /api/appointments/calendar. A patient
// booking their own appointment sees the same visual shape (which slots are
// open or taken) but the enforcement is HERE, not in the UI: this response
// NEVER includes another patient's name, reason, status, or appointment id
// — not even for the patient's OWN booking (their own appointments are a
// separate, already-built read screen). A slot with any non-cancelled
// appointment on it is just `available: false`, full stop. There is no code
// path in this handler that can leak more than that boolean, by
// construction — it never even selects patient/appointment columns.
export const GET = patientApiRoute(async (request, { session }) => {
  const active = await isModuleActive(session.tenantId, "APPOINTMENTS");
  if (!active) return json({ moduleActive: false, slots: [] });

  const url = new URL(request.url);
  const doctorIdParam = url.searchParams.get("doctorId");
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  if (!doctorIdParam || !fromStr || !toStr) {
    return json({ error: "doctorId, from and to (YYYY-MM-DD) are required" }, 400);
  }

  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return json({ error: "invalid date range" }, 400);
  }
  if (Math.round((to - from) / DAY_MS) > MAX_RANGE_DAYS) {
    return json({ error: `range too large (max ${MAX_RANGE_DAYS} days)` }, 400);
  }

  const doctorUserId = BigInt(doctorIdParam);
  const slotTemplates = await tenantDb.doctor_slots.findMany({ where: { doctor_user_id: doctorUserId, active: true } });
  const instances = projectSlotInstances(slotTemplates, from, to);

  const toExclusive = new Date(to.getTime() + DAY_MS);
  // Deliberately select nothing but the timestamp — there is nothing here
  // for a later line of code to accidentally leak.
  const bookedTimes = await tenantDb.appointments.findMany({
    where: { doctor_user_id: doctorUserId, slot_time: { gte: from, lt: toExclusive }, status: { not: "CANCELLED" } },
    select: { slot_time: true },
  });
  const bookedSet = new Set(bookedTimes.map((a) => a.slot_time.getTime()));

  const slots = instances.map((inst) => ({
    slotTime: inst.slotTime,
    available: !bookedSet.has(inst.slotTime.getTime()),
  }));

  return json({ moduleActive: true, slots });
});
