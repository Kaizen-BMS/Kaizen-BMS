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

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6]; // Mon–Sat, the product's long-standing default

/** A duty ("09:00–17:00") on exactly the given days of the week (0=Sun..6=Sat), off the rest. */
function fixedWeek(start, end) {
  return [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, start, end, off: dow === 0 }));
}
function customWeek(start, end, workDays) {
  const set = new Set(workDays);
  return [0, 1, 2, 3, 4, 5, 6].map((dow) => (set.has(dow) ? { dow, start, end, off: false } : { dow, off: true }));
}

/** "Mon–Sat" for a contiguous run, else "Mon Wed Fri" — the compact label the Directory table shows. */
function workDaysLabel(days) {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  if (sorted.length === 7) return "Every day";
  // Contiguous Mon..Sat (or any single unbroken run) reads better as a range.
  const isRun = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (isRun && sorted.length > 2) return `${DAY_SHORT[sorted[0]]}–${DAY_SHORT[sorted[sorted.length - 1]]}`;
  return sorted.map((d) => DAY_SHORT[d]).join(" ");
}

/**
 * Called when a person's profile gets duty hours (Add Staff, or editing their profile later): the
 * chosen hours + working days become their weekly schedule directly — no separate trip to the Duty
 * Roster screen just to tell the system which days they work. `workDays` (0=Sun..6=Sat) defaults to
 * Mon–Sat, this product's existing convention, when the caller doesn't pick specific days.
 */
async function applyDutyFromProfile(tenantId, userId, body, actorId) {
  if (!body.dutyStart || !body.dutyEnd) return;
  const days = Array.isArray(body.workDays) && body.workDays.length ? [...new Set(body.workDays)] : DEFAULT_WORK_DAYS;
  await saveWeeklySchedule(tenantId, userId, customWeek(body.dutyStart, body.dutyEnd, days));
  await logHistory(tenantId, userId, "DUTY_CHANGED", `Duty ${body.dutyStart}–${body.dutyEnd} on ${workDaysLabel(days)}`, actorId);
}

/** Batch summary for a Directory-style table: { [userId]: { label, days: [0..6] } }, one query, no N+1. */
async function loadWeeklySummaries(tenantId, userIds) {
  const rows = await prisma.staff_schedules.findMany({
    where: { tenant_id: BigInt(tenantId), user_id: { in: userIds.map((id) => BigInt(id)) }, is_off: false },
    select: { user_id: true, day_of_week: true },
  });
  const byUser = new Map();
  for (const r of rows) {
    const k = String(r.user_id);
    if (!byUser.has(k)) byUser.set(k, []);
    byUser.get(k).push(r.day_of_week);
  }
  const out = new Map();
  for (const [k, days] of byUser) out.set(k, { days, label: workDaysLabel(days) });
  return out;
}

module.exports = {
  ddmmyy, applyDutyFromProfile, OFFSET_MIN, timeMin, localMin, hhmm, dateKey, dowOf, makeShift,
  loadScheduleResolver, dayMetrics, logHistory, saveWeeklySchedule, fixedWeek, workDaysLabel,
  loadWeeklySummaries, DAY_SHORT, DEFAULT_WORK_DAYS,
};
