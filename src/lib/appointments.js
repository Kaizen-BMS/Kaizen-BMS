"use strict";

const { requireTenantId } = require("./requestContext");
const { writeOutboxEvent } = require("./outbox");

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * doctor_slots.start_time/end_time are `TIME` columns — pure wall-clock time
 * of day with no date or timezone attached. Prisma's engine round-trips a
 * TIME value as a Date anchored to 1970-01-01 in UTC, so both writing
 * ("09:00" -> a Date) and reading (a Date -> minutes) go through UTC
 * consistently here — this has nothing to do with any real timezone, it's
 * just an arbitrary-but-consistent anchor so the value never accidentally
 * round-trips through the machine's local offset.
 */
function hhmmToTimeValue(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

function timeValueToMinutes(t) {
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

function minutesToHHMM(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * A `slot_time` (or any admitted_at/check_in_at-style column elsewhere in
 * this project) is a genuine calendar moment, not a bare time-of-day — it
 * uses plain local `Date` arithmetic, the same "naive wall clock, whatever
 * timezone the app/DB server share" convention already used everywhere else
 * in this codebase (no explicit UTC/timezone conversion exists anywhere
 * else either — introducing one only for appointments would be a one-off
 * inconsistency, not a real improvement, for a single-country deployment).
 */
function dateAtMinutes(baseDate, minutes) {
  const d = new Date(baseDate);
  d.setHours(0, minutes, 0, 0);
  return d;
}

/**
 * Project doctor_slots templates onto real bookable instances between
 * [from, to] (inclusive local-midnight Date objects). Purely computed, never
 * stored — same "derive at read time" principle as recomputeBillStatus.
 */
function projectSlotInstances(slots, from, to) {
  const instances = [];
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + DAY_MS)) {
    const dow = d.getDay(); // 0 = Sunday, matching doctor_slots.day_of_week
    for (const slot of slots) {
      if (!slot.active || slot.day_of_week !== dow) continue;
      const startMin = timeValueToMinutes(slot.start_time);
      const endMin = timeValueToMinutes(slot.end_time);
      for (let m = startMin; m + slot.slot_minutes <= endMin; m += slot.slot_minutes) {
        instances.push({
          doctorUserId: slot.doctor_user_id,
          slotTime: dateAtMinutes(d, m),
        });
      }
    }
  }
  return instances;
}

/**
 * Server-side re-validation that a client-supplied slotTime actually lands
 * on one of this doctor's active slot templates — never trust a bare
 * datetime from the client, same discipline as re-checking any
 * client-supplied FK elsewhere in this project.
 */
function slotTimeIsValid(slots, doctorUserId, slotTime) {
  if (slotTime.getSeconds() !== 0 || slotTime.getMilliseconds() !== 0) return false;
  const dow = slotTime.getDay();
  const minutes = slotTime.getHours() * 60 + slotTime.getMinutes();
  return slots.some((slot) => {
    if (String(slot.doctor_user_id) !== String(doctorUserId)) return false;
    if (!slot.active || slot.day_of_week !== dow) return false;
    const startMin = timeValueToMinutes(slot.start_time);
    const endMin = timeValueToMinutes(slot.end_time);
    if (minutes < startMin || minutes + slot.slot_minutes > endMin) return false;
    return (minutes - startMin) % slot.slot_minutes === 0;
  });
}

// Statuses that still hold a doctor's slot (mirrors the generated
// active_slot_time column: only CANCELLED frees it).
const SLOT_HOLDING_STATUSES = ["BOOKED", "CONFIRMED", "COMPLETED", "NO_SHOW"];

/**
 * Book a slot — the ONE shared implementation of double-booking prevention
 * (see migration 016's comment on `active_slot_time` for why this is a
 * unique-constraint insert race, not a FOR UPDATE lock like FEFO). Used by
 * both the staff booking route and the patient portal's, so there is only
 * ever one place this logic can drift.
 *
 * Returns a result object rather than throwing: staff routes (apiRoute.js)
 * and patient routes (patientApiRoute.js) each define their OWN HttpError
 * class, so a thrown error type from here could only ever be caught
 * correctly by one of them. Callers translate `{ ok: false, status, error }`
 * into their own HttpError/`json()` response.
 */
async function bookAppointment(tenantDb, { doctorUserId, slotTime, patientId, newPatient, reason, bookedBy }) {
  const slots = await tenantDb.doctor_slots.findMany({ where: { doctor_user_id: doctorUserId, active: true } });
  if (!slotTimeIsValid(slots, doctorUserId, slotTime)) {
    return { ok: false, status: 400, error: "slot_not_available" };
  }

  try {
    const appointmentId = await tenantDb.$transaction(async (tx) => {
      let pid = patientId || null;
      if (!pid) {
        const p = await tx.patients.create({
          data: { name: newPatient.name, age: newPatient.age ?? null, phone: newPatient.phone },
        });
        pid = p.id;
      } else {
        const existing = await tx.patients.findUnique({ where: { id: pid } });
        if (!existing) {
          const e = new Error("patient_not_found");
          e.httpStatus = 404;
          throw e;
        }
      }
      const appt = await tx.appointments.create({
        data: {
          patient_id: pid,
          doctor_user_id: doctorUserId,
          slot_time: slotTime,
          booked_by: bookedBy,
          reason: reason || null,
        },
      });
      // Durable event, same transaction as the appointment write — see
      // CLAUDE.md "Outbox — durable domain events". Both staff
      // (POST /api/appointments) and patient-portal booking share this
      // one function, so both automatically get this for free. This is
      // NOT the realtime emit — emitToModule("appointment:booked") below
      // in each caller stays exactly as it was, untouched.
      await writeOutboxEvent(tx, {
        tenantId: requireTenantId(),
        eventType: "AppointmentBooked",
        aggregateType: "Appointment",
        aggregateId: appt.id,
        payload: {
          appointmentId: Number(appt.id),
          patientId: Number(pid),
          doctorUserId: Number(doctorUserId),
          slotTime: slotTime.toISOString(),
          bookedBy,
        },
      });
      return appt.id;
    });
    return { ok: true, appointmentId };
  } catch (err) {
    if (err?.httpStatus === 404) return { ok: false, status: 404, error: err.message };
    if (err?.code === "P2002") return { ok: false, status: 409, error: "slot_taken" };
    throw err;
  }
}

module.exports = {
  hhmmToTimeValue,
  timeValueToMinutes,
  minutesToHHMM,
  dateAtMinutes,
  projectSlotInstances,
  slotTimeIsValid,
  SLOT_HOLDING_STATUSES,
  bookAppointment,
};
