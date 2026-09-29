"use strict";

/**
 * Shared by every self-scheduling background loop that talks to the
 * database (src/lib/outboxProcessor.js, src/lib/analytics/scheduler.js) —
 * one place this classification can possibly drift, not two copies that
 * could disagree. A DATABASE-UNREACHABLE-OR-UNAUTHORIZED failure means the
 * DB server itself refused the connection or this credential — a
 * completely different situation from "one job's own work threw" — and
 * retrying it on a fixed short interval is exactly the pattern that got a
 * shared-hosting MySQL account's access automatically revoked as abuse
 * (a real incident, 2026-09). Detected by Prisma's own error codes plus a
 * text fallback for the raw-query path (a permission failure there can
 * surface as a generic P2010 with the real reason only in the message).
 */
function isConnectionOrAuthError(err) {
  const code = err?.code;
  if (code === "P1001" || code === "P1002" || code === "P1010" || code === "P2010") return true;
  const msg = String(err?.message || err || "");
  return /access denied|permission denied|authentication|ECONNREFUSED|ETIMEDOUT/i.test(msg);
}

module.exports = { isConnectionOrAuthError };
