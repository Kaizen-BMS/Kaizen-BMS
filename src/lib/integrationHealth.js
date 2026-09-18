"use strict";

/** Observed health columns on external_providers — never a separately stored status enum, always derived (see externalProviders.js's deriveHealth()). */
function toId(v) {
  return typeof v === "bigint" ? v : BigInt(v);
}

async function recordSuccess(db, providerId, { latencyMs } = {}) {
  return db.external_providers.update({
    where: { id: toId(providerId) },
    data: { last_success_at: new Date(), failure_count: 0, last_error_category: null, last_latency_ms: latencyMs ?? undefined },
  });
}

async function recordFailure(db, providerId, { errorCategory, latencyMs } = {}) {
  return db.external_providers.update({
    where: { id: toId(providerId) },
    data: { last_failure_at: new Date(), failure_count: { increment: 1 }, last_error_category: errorCategory || "unknown", last_latency_ms: latencyMs ?? undefined },
  });
}

module.exports = { recordSuccess, recordFailure };
