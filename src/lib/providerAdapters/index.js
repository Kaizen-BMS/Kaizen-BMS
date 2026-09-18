"use strict";

/**
 * Adapter registry — the one place provider-specific code is looked up.
 * Core Lab/Pharmacy business logic never imports an adapter directly;
 * only src/lib/externalLab.js / externalPharmacy.js do, keeping
 * provider-specific code from leaking into internal domain logic (this
 * task's own explicit architectural rule).
 *
 * THE ADAPTER INTERFACE (Real Vendor Integration Readiness — TASK 2/16).
 * Every adapter module exports a subset of these functions. Every function
 * receives `{ payload, provider, credentials }` (createOrder/cancelOrder/
 * checkStatus) or `{ provider, credentials }` (checkConnection) — never
 * just a bare payload — so a real adapter has everything it needs to
 * actually call a vendor's API:
 *   - `payload`     the already contract-validated, PHI-minimal request
 *                    body (see dataContracts.js's EXTERNAL_* entries).
 *   - `provider`     { id, name, providerType, providerCode, environment,
 *                      baseUrl (already environment-resolved — see
 *                      externalProviders.js's resolveBaseUrl()), config
 *                      (parsed, non-secret vendor settings) }.
 *   - `credentials`  the decrypted credential fields for this provider
 *                    (externalCredentials.js's getCredentialFields()) —
 *                    null if none is configured yet. A real adapter should
 *                    fail clearly (not silently) when a field it needs is
 *                    missing; that surfaces as AUTH_FAILED/CONFIG_ERROR
 *                    health, not a confusing generic error.
 *
 * Required:
 *   createOrder({ payload, provider, credentials })
 *     -> { ok, externalOrderRef, raw }  on success
 *     -> { ok: false, raw }             on a clean vendor-side rejection
 *     -> may throw for a transport-level failure (network/timeout/5xx);
 *        the orchestration layer (externalLab.js/externalPharmacy.js)
 *        catches this and records it as a FAILED ExternalOrder.
 *
 * Optional (a real adapter implements only what the vendor supports —
 * absence of a method is a real, honest "not supported," never faked):
 *   cancelOrder({ externalOrderRef, provider, credentials }) -> { ok, raw }
 *   checkStatus({ externalOrderRef, provider, credentials })
 *     -> { ok, rawStatus, raw }  — for a vendor that must be polled rather
 *        than pushing a webhook. Status is normalized via
 *        statusMapping.js's normalizeStatus() against the provider's own
 *        config.statusMap, never assumed to share Kaizen's vocabulary.
 *   checkConnection({ provider, credentials }) -> { ok, latencyMs, error }
 *     — a safe, side-effect-free reachability/auth check (e.g. a vendor's
 *       own health/ping endpoint, or a harmless read-only call), used by
 *       POST /api/external/providers/[id]/test-connection. A real vendor
 *       that has no such endpoint simply doesn't implement this — the
 *       route responds 501, never a fabricated "connected."
 *
 * MOCK-only (never part of a real adapter — used exclusively by the
 * admin-triggered "simulate provider webhook" test action):
 *   buildResultWebhook() / buildFulfillmentWebhook()
 */
const mockLab = require("./mockLabAdapter");
const mockPharmacy = require("./mockPharmacyAdapter");

const ADAPTERS = {
  MOCK_LAB: mockLab,
  MOCK_PHARMACY: mockPharmacy,
};

function getAdapter(providerCode) {
  const adapter = ADAPTERS[providerCode];
  if (!adapter) throw new Error(`no adapter registered for provider code "${providerCode}"`);
  return adapter;
}

module.exports = { getAdapter, ADAPTERS };
