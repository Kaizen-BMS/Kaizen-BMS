"use strict";

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

module.exports = {
  hhmmToTimeValue,
  timeValueToMinutes,
  minutesToHHMM,
  dateAtMinutes,
  projectSlotInstances,
  slotTimeIsValid,
  SLOT_HOLDING_STATUSES,
};
