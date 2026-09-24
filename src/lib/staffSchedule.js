"use strict";

/**
 * Who is supposed to work when, and how a real day compares with that plan.
 * A person's plan is (in order): a one-off roster shift for that date, else
 * their weekly schedule for that weekday (configured once), else nothing.
 * Late / worked / overtime / shortfall are always derived from the actual
 * check-in/out times against that plan at read time — never stored, so a
 * schedule change or a correction can never leave a stale number behind.
 */
const { prisma } = require("./prismaClient");

// Facility wall-clock offset from UTC in minutes (India = +5:30). The server
// runs in UTC (server.js) while schedules are wall-clock "09:00" values.
const OFFSET_MIN = Number(process.env.FACILITY_UTC_OFFSET_MIN ?? 330);

const timeMin = (t) => (t == null ? null : new Date(t).getUTCHours() * 60 + new Date(t).getUTCMinutes());
const localMin = (instant) => {
  const d = new Date(new Date(instant).getTime() + OFFSET_MIN * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const dateKey = (d) => new Date(d).toISOString().slice(0, 10);
const dowOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();

/** DD/MM/YY for staff history text. */
const ddmmyy = (d) => {
  const [y, m, day] = new Date(d).toISOString().slice(0, 10).split("-");
  return `${day}/${m}/${y.slice(2)}`;
};

function hhmm(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** { startMin, endMin (may exceed 1440 for a night shift), scheduledMinutes } */
function makeShift(startMin, endMin) {
  const end = endMin <= startMin ? endMin + 1440 : endMin;
  return { startMin, endMin: end, scheduledMinutes: end - startMin, start: hhmm(startMin), end: hhmm(endMin) };
}

/** A resolver `(userId, dateStr) => shift | { off: true } | null` for a date range, loaded in two queries. */
async function loadScheduleResolver(tenantId, fromStr, toStr) {
  const tid = BigInt(tenantId);
  const [rosters, weekly] = await Promise.all([
    prisma.duty_shifts.findMany({ where: { tenant_id: tid, shift_date: { gte: new Date(fromStr), lte: new Date(toStr) } } }),
    prisma.staff_schedules.findMany({ where: { tenant_id: tid } }),
  ]);
  const rosterBy = new Map();
  for (const r of rosters) {
    const k = `${r.user_id}:${dateKey(r.shift_date)}`;
    rosterBy.set(k, [...(rosterBy.get(k) || []), r]);
  }
  const weeklyBy = new Map(weekly.map((w) => [`${w.user_id}:${w.day_of_week}`, w]));
  return (userId, dateStr) => {
    const r = rosterBy.get(`${userId}:${dateStr}`);
    if (r?.length) {
      const start = Math.min(...r.map((x) => timeMin(x.start_time)));
      const last = r.reduce((a, x) => (timeMin(x.end_time) > timeMin(a.end_time) ? x : a), r[0]);
      return { ...makeShift(start, timeMin(last.end_time)), source: "ROSTER" };
    }
    const w = weeklyBy.get(`${userId}:${dowOf(dateStr)}`);
    if (!w) return null;
    if (w.is_off || w.start_time == null || w.end_time == null) return { off: true, source: "WEEKLY" };
    return { ...makeShift(timeMin(w.start_time), timeMin(w.end_time)), source: "WEEKLY" };
  };
}

/** Compare one real day with its plan. `workedMinutes` is the existing attendance.computeWorkedMinutes value. */
function dayMetrics(shift, { checkIn, checkOut, workedMinutes }) {
  const out = { scheduledMinutes: null, lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: workedMinutes || 0, overtimeMinutes: 0, shortfallMinutes: 0 };
  if (!shift || shift.off) return out;
  out.scheduledMinutes = shift.scheduledMinutes;
  if (checkIn) {
    const ci = localMin(checkIn);
    // A check-in hours before the shift is "on time"; only arriving after the start counts as late.
    out.lateMinutes = ci > shift.startMin && ci - shift.startMin < 16 * 60 ? ci - shift.startMin : 0;
  }
  if (checkOut) {
    let co = localMin(checkOut);
    if (shift.endMin > 1440 && co < shift.startMin) co += 1440;
    out.earlyLeaveMinutes = Math.max(0, shift.endMin - co);
    out.overtimeMinutes = Math.max(0, out.workedMinutes - shift.scheduledMinutes);
    out.shortfallMinutes = Math.max(0, shift.scheduledMinutes - out.workedMinutes);
  }
  return out;
}

async function logHistory(tenantId, userId, eventType, detail, createdBy) {
  await prisma.staff_history.create({
    data: { tenant_id: BigInt(tenantId), user_id: BigInt(userId), event_type: eventType, detail: String(detail || "").slice(0, 500), created_by: createdBy ? BigInt(createdBy) : null },
  });
}

/** Replace a person's weekly schedule. days: [{ dow 0-6, start "HH:MM"|null, end, off }]. */
async function saveWeeklySchedule(tenantId, userId, days) {
  const tid = BigInt(tenantId);
  const uid = BigInt(userId);
  await prisma.$transaction(async (tx) => {
    for (const d of days) {
      const off = !!d.off || !d.start || !d.end;
      const data = {
        is_off: off,
        start_time: off ? null : new Date(`1970-01-01T${d.start}:00.000Z`),
        end_time: off ? null : new Date(`1970-01-01T${d.end}:00.000Z`),
      };
      await tx.staff_schedules.upsert({
        where: { tenant_id_user_id_day_of_week: { tenant_id: tid, user_id: uid, day_of_week: d.dow } },
        update: data,
        create: { tenant_id: tid, user_id: uid, day_of_week: d.dow, ...data },
      });
    }
  });
}

/** A fixed duty ("09:00–17:00") becomes Mon–Sat on duty, Sunday off — configured once. */
function fixedWeek(start, end) {
  return [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start, end, off: dow === 0 }));
}

/**
 * Called when a person's profile gets duty hours: a FIXED duty becomes their weekly
 * schedule (Mon–Sat on duty, Sunday off) so nobody re-enters hours day by day.
 * A SHIFT worker's schedule is set on the Duty Roster (shift templates / roster).
 */
async function applyDutyFromProfile(tenantId, userId, body, actorId) {
  if ((body.dutyType || "FIXED") !== "FIXED" || !body.dutyStart || !body.dutyEnd) return;
  await saveWeeklySchedule(tenantId, userId, fixedWeek(body.dutyStart, body.dutyEnd));
  await logHistory(tenantId, userId, "DUTY_CHANGED", `Fixed duty ${body.dutyStart}–${body.dutyEnd} (Mon–Sat)`, actorId);
}

module.exports = { ddmmyy, applyDutyFromProfile, OFFSET_MIN, timeMin, localMin, hhmm, dateKey, dowOf, makeShift, loadScheduleResolver, dayMetrics, logHistory, saveWeeklySchedule, fixedWeek };
