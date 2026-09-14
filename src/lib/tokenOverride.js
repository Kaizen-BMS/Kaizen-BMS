"use strict";

const { HttpError } = require("./apiRoute");
const { can } = require("./rbac");

/**
 * Resolve the token_number for a new visit. With no manual token supplied,
 * this is the existing auto-increment behavior, unchanged. With one
 * supplied, it's a receptionist override: requires visit:override_token,
 * requires a reason (accountable, not silent — same authorized_by+reason
 * shape as Billing discounts), and checks the number isn't already taken
 * today. Like the pre-existing auto-increment COUNT+1, this check is not
 * wrapped in a locking transaction — manual overrides are a human-paced,
 * low-frequency front-desk action, not a programmatic hot path, so this
 * intentionally matches the concurrency rigor already accepted for the
 * auto-increment path rather than holding the override to a higher bar.
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

/** Log the override — the log IS the audit trail, same as bed_transfers/pharmacy_stock_movements. */
async function logTokenOverride(tenantDb, { visitId, tokenNumber, reason, overriddenBy }) {
  await tenantDb.token_overrides.create({
    data: { visit_id: visitId, token_number: tokenNumber, reason, overridden_by: overriddenBy },
  });
}

module.exports = { resolveTokenNumber, logTokenOverride };
