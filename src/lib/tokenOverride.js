"use strict";

const { HttpError } = require("./apiRoute");
const { can } = require("./rbac");

/**
 * Resolve the token_number for a new visit. With no manual token supplied,
 * this is the existing auto-increment behavior, unchanged. With one
 * supplied, it's a receptionist override: requires visit:override_token,
 * requires a reason (accountable, not silent — same authorized_by+reason
 * shape as Billing discounts), and pre-checks the number isn't already
 * taken today for a clean, fast 409 message.
 *
 * That pre-check alone does NOT close the race, though — an override is
 * specifically for priority/emergency situations, which is exactly when
 * two receptionists on different terminals are most likely to race for the
 * same "obviously correct" number, and a silent duplicate in that exact
 * scenario is the worst possible time for it to happen. The real guarantee
 * is the DB-level `uq_visits_tenant_date_token` unique constraint
 * (migration 018) — `createVisitWithToken()` below is what actually
 * enforces it, by translating a unique-constraint violation on the INSERT
 * itself into the same 409. This check-then-insert-with-a-real-constraint-
 * behind-it shape mirrors Appointment double-booking (migration 016) and
 * Feedback's once-per-visit rule exactly.
 */
async function resolveTokenNumber(tenantDb, tenantId, role, { manualToken, overrideReason }) {
  if (manualToken == null) {
    const countRows = await tenantDb.$queryRawUnsafe(
      "SELECT COUNT(*) AS n FROM visits WHERE tenant_id = ? AND DATE(created_at) = CURDATE()",
      BigInt(tenantId),
    );
    return { tokenNumber: Number(countRows[0].n) + 1, overridden: false };
  }

  if (!can(role, "visit:override_token")) throw new HttpError(403, "forbidden");
  if (!overrideReason) throw new HttpError(400, "reason required for a manual token override");

  const existing = await tenantDb.$queryRawUnsafe(
    "SELECT id FROM visits WHERE tenant_id = ? AND DATE(created_at) = CURDATE() AND token_number = ? LIMIT 1",
    BigInt(tenantId),
    manualToken,
  );
  if (existing.length > 0) throw new HttpError(409, "token_already_taken");

  return { tokenNumber: manualToken, overridden: true };
}

/**
 * Create the visit, translating a `uq_visits_tenant_date_token` violation
 * (two requests slipping past the pre-check at the same instant) into the
 * same clean 409 the pre-check itself returns — the real guarantee under a
 * genuine race, verified with concurrent requests, not just the app-level
 * check alone.
 */
async function createVisitWithToken(tenantDb, data, include) {
  try {
    return await tenantDb.visits.create({ data, include });
  } catch (err) {
    if (err?.code === "P2002") throw new HttpError(409, "token_already_taken");
    throw err;
  }
}

/** Log the override — the log IS the audit trail, same as bed_transfers/pharmacy_stock_movements. */
async function logTokenOverride(tenantDb, { visitId, tokenNumber, reason, overriddenBy }) {
  await tenantDb.token_overrides.create({
    data: { visit_id: visitId, token_number: tokenNumber, reason, overridden_by: overriddenBy },
  });
}

module.exports = { resolveTokenNumber, createVisitWithToken, logTokenOverride };
