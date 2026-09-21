"use strict";

const { tenantDb, prisma } = require("./prismaClient");

/**
 * The DB server's current calendar day — same `CURDATE()`-based "today"
 * convention already used everywhere else in this project (queue tokens,
 * dashboard stat cards; see registration/patients' comment: "depends on the
 * DB server's own clock — keep this one query raw so 'today' means exactly
 * what it always has"). Avoids a JS-process-vs-DB-server timezone mismatch
 * deciding which calendar day an attendance row belongs to.
 */
async function serverToday() {
  const rows = await tenantDb.$queryRawUnsafe("SELECT CURDATE() AS d");
  return rows[0].d;
}

/** The open (not-yet-ended) break in a list, if any — the person is "OUT". */
function findOpenBreak(breaks) {
  return breaks?.find((b) => !b.in_at) || null;
}

function computeStatus(log, openBreak) {
  if (!log || !log.check_in_at) return "NOT_CHECKED_IN";
  if (log.check_out_at) return "CHECKED_OUT";
  if (openBreak) return "OUT";
  return "CHECKED_IN";
}

/**
 * Minutes actually worked: elapsed check-in → (check-out, or now if still
 * clocked in), minus PERSONAL break time elapsed so far. HOSPITAL_WORK
 * breaks are NOT deducted — the person is still on hospital business, just
 * physically elsewhere. Always derived from timestamps at read time, never
 * stored, so it's never stale (same principle as recomputeBillStatus).
 */
function computeWorkedMinutes(log, breaks) {
  if (!log?.check_in_at) return 0;
  const end = log.check_out_at ? new Date(log.check_out_at) : new Date();
  let minutes = Math.max(0, (end - new Date(log.check_in_at)) / 60000);
  for (const b of breaks || []) {
    if (b.category !== "PERSONAL") continue;
    const bEnd = b.in_at ? new Date(b.in_at) : new Date();
    minutes -= Math.max(0, (bEnd - new Date(b.out_at)) / 60000);
  }
  return Math.max(0, Math.round(minutes));
}

/** Shape a {log, breaks} pair into the summary object every endpoint returns. */
function summarize(log, breaks) {
  const openBreak = findOpenBreak(breaks);
  return {
    log,
    breaks: breaks || [],
    status: computeStatus(log, openBreak),
    workedMinutes: computeWorkedMinutes(log, breaks),
  };
}

/**
 * Who a receptionist / admin / owner is marking attendance for: any LOGIN
 * person of this facility (`userId`) or a person with no login
 * (`staffMemberId`). Nobody needs a computer or a login to be marked.
 */
async function proxySubject(tenantId, { userId, staffMemberId }) {
  if (userId) {
    const u = await prisma.users.findFirst({ where: { id: BigInt(userId), tenant_id: BigInt(tenantId) }, select: { id: true, active: true, role: true } });
    if (!u || u.role === "SUPER_ADMIN") return null;
    return { type: "USER", id: u.id };
  }
  if (staffMemberId) {
    const m = await tenantDb.staff_members.findUnique({ where: { id: BigInt(staffMemberId) } });
    return m ? { type: "STAFF_MEMBER", id: m.id, active: !!m.active } : null;
  }
  return null;
}

/**
 * The person left (checked out) and now comes back the same day: reopen the
 * day. The time they were away is kept as a PERSONAL break, so worked time is
 * still right, and nothing about the first check-in is lost.
 */
async function reopenDay(tx, log, photoDataUrl) {
  await tx.attendance_breaks.create({
    data: { attendance_log_id: log.id, out_at: log.check_out_at, in_at: new Date(), category: "PERSONAL", reason: "Left and came back" },
  });
  return tx.attendance_logs.update({
    where: { id: log.id },
    data: { check_out_at: null, check_out_photo_url: null, ...(photoDataUrl ? { check_in_photo_url: photoDataUrl } : {}) },
  });
}

module.exports = {
  reopenDay,
  proxySubject, serverToday, findOpenBreak, computeStatus, computeWorkedMinutes, summarize };
