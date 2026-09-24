import { prisma } from "@/lib/prismaClient";
import { HttpError } from "@/lib/apiRoute";
import { OFFSET_MIN, loadScheduleResolver, localMin, hhmm } from "@/lib/staffSchedule";

// Average time a doctor spends per patient — used only to estimate "your turn at about …".
export const MINUTES_PER_PATIENT = 10;

const facilityDate = () => new Date(Date.now() + OFFSET_MIN * 60000).toISOString().slice(0, 10);

/**
 * The hospital's doctors as reception sees them today: their timing (roster shift, else weekly
 * schedule), whether they are on duty right now, how many are waiting for them, and roughly when a
 * patient registered now would be seen. The estimate is a guide, not a promise.
 */
export async function listOpdDoctors(tenantId) {
  const tid = BigInt(tenantId);
  const today = facilityDate();
  const [doctors, resolver, counts, leaves] = await Promise.all([
    prisma.users.findMany({ where: { tenant_id: tid, role: "DOCTOR", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadScheduleResolver(tenantId, today, today),
    prisma.$queryRawUnsafe(
      `SELECT doctor_id, SUM(status IN ('REGISTERED','TRIAGE')) AS waiting, SUM(status = 'WITH_DOCTOR') AS with_doctor
         FROM visits WHERE tenant_id = ? AND doctor_id IS NOT NULL AND created_at >= CURDATE()
          AND status IN ('REGISTERED','TRIAGE','WITH_DOCTOR') GROUP BY doctor_id`,
      tid,
    ),
    prisma.leave_requests.findMany({ where: { tenant_id: tid, status: "APPROVED", from_date: { lte: new Date(today) }, to_date: { gte: new Date(today) } }, select: { user_id: true } }),
  ]);
  const cnt = new Map(counts.map((c) => [String(c.doctor_id), { waiting: Number(c.waiting), withDoctor: Number(c.with_doctor) }]));
  const onLeave = new Set(leaves.map((l) => String(l.user_id)));
  const nowMin = localMin(new Date());

  return doctors.map((d) => {
    const id = String(d.id);
    const c = cnt.get(id) || { waiting: 0, withDoctor: 0 };
    const shift = resolver(id, today);
    let state = "NOT_SET";
    if (onLeave.has(id)) state = "ON_LEAVE";
    else if (shift?.off) state = "OFF_TODAY";
    else if (shift) state = nowMin < shift.startMin ? "LATER" : nowMin >= shift.endMin ? "ENDED" : "ON_DUTY";
    const ahead = c.waiting + c.withDoctor;
    let eta = null;
    let beyondShift = false;
    if (state === "ON_DUTY" || state === "LATER") {
      const at = Math.max(nowMin, shift.startMin) + ahead * MINUTES_PER_PATIENT;
      beyondShift = at >= shift.endMin;
      eta = hhmm(at);
    }
    return {
      id: Number(d.id),
      name: d.name,
      timing: shift && !shift.off ? `${shift.start}–${shift.end}` : null,
      state,
      waiting: c.waiting,
      withDoctor: c.withDoctor,
      ahead,
      eta,
      beyondShift,
    };
  });
}

/** Validate a doctor id chosen at registration: must be an active doctor of this hospital. */
export async function requireDoctor(tenantId, doctorId) {
  if (doctorId == null) return null;
  const u = await prisma.users.findFirst({ where: { id: BigInt(doctorId), tenant_id: BigInt(tenantId), role: "DOCTOR", active: true }, select: { id: true } });
  if (!u) throw new HttpError(400, "doctor_not_found");
  return u.id;
}

export async function doctorName(tenantId, doctorId) {
  if (!doctorId) return null;
  const u = await prisma.users.findFirst({ where: { id: BigInt(doctorId), tenant_id: BigInt(tenantId) }, select: { name: true } });
  return u?.name || null;
}

/**
 * For the printed slip: the doctor's name and roughly when this patient will be seen — from the
 * doctor's timing that day and how many earlier patients are still waiting for them. No timing set
 * means no time is printed (never a made-up one).
 */
export async function estimateForVisit(tenantId, visit) {
  if (!visit.doctor_id) return { doctor: "", expected: "" };
  const day = new Date(new Date(visit.created_at).getTime() + OFFSET_MIN * 60000).toISOString().slice(0, 10);
  const [name, resolver, rows] = await Promise.all([
    doctorName(tenantId, visit.doctor_id),
    loadScheduleResolver(tenantId, day, day),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM visits WHERE tenant_id = ? AND doctor_id = ? AND DATE(created_at) = DATE(?)
          AND (created_at < ? OR (created_at = ? AND id < ?)) AND status IN ('REGISTERED','TRIAGE','WITH_DOCTOR')`,
      BigInt(tenantId), visit.doctor_id, visit.created_at, visit.created_at, visit.created_at, visit.id,
    ),
  ]);
  const shift = resolver(String(visit.doctor_id), day);
  let expected = "";
  if (visit.expected_time) {
    expected = `Expected time: ${visit.expected_time}`;
  } else if (shift && !shift.off) {
    const at = Math.max(localMin(visit.created_at), shift.startMin) + Number(rows[0].n) * MINUTES_PER_PATIENT;
    expected = `Expected time: ${hhmm(at)}`;
  }
  const label = name ? (/^dr\.?\s/i.test(name) ? name : `Dr. ${name}`) : "";
  return { doctor: label ? `Doctor: ${label}` : "", expected };
}

/** The time to promise a patient registered right now with this doctor (null when no timing is set / off duty). Stored on the visit. */
export async function expectedTimeNow(tenantId, doctorId) {
  if (!doctorId) return null;
  const d = (await listOpdDoctors(tenantId)).find((x) => x.id === Number(doctorId));
  return d?.eta || null;
}
