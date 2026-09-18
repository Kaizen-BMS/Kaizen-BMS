"use strict";

/**
 * Mock/Sandbox Lab adapter — simulates an external laboratory's API so
 * the COMPLETE architecture can be exercised without pretending a real
 * third-party integration exists (per this task's own explicit
 * instruction). Never presented as a real provider — providerCode
 * "MOCK_LAB" and its label make this unambiguous everywhere it surfaces.
 *
 * `createOrder()` simulates the provider accepting the order instantly
 * (no real network round-trip exists to make — there is no real server
 * behind this). The REST/timeout/retry machinery in outboundClient.js is
 * real, generic code; it's simply not exercised against a live remote
 * endpoint for this adapter, since none exists. A real provider adapter
 * would call outboundClient.callProvider() here instead of returning a
 * canned response — see providerAdapters/index.js's interface doc for the
 * exact shape a real adapter implements.
 *
 * `provider.config.mockFailureMode` (Real Vendor Integration Readiness,
 * TASK 11): a deterministic, admin-toggleable way to force this adapter to
 * fail, so the retry endpoint can be exercised against a genuine outbound
 * failure without weakening any real failure handling. A real adapter must
 * never read this flag — it only exists on MOCK providers' own config.
 */
const crypto = require("crypto");

async function createOrder({ payload, provider }) {
  if (provider?.config?.mockFailureMode) {
    throw new Error("MOCK_PROVIDER_MODE=FAIL — simulated outbound failure for retry testing");
  }
  // Simulates provider-side acceptance — a real adapter's equivalent call
  // is genuinely async/networked; this one is synchronous by necessity.
  const externalOrderRef = `MOCKLAB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  return { ok: true, externalOrderRef, raw: { accepted: true, orderId: externalOrderRef, testName: payload.testName } };
}

async function cancelOrder({ externalOrderRef }) {
  return { ok: true, raw: { cancelled: externalOrderRef } };
}

/** Trivial, always-ok reachability check — the mock has no real network dependency to actually fail (unless mockFailureMode is on), which is the honest answer for a simulator, not a fabricated "healthy." */
async function checkConnection({ provider }) {
  if (provider?.config?.mockFailureMode) return { ok: false, latencyMs: 1, error: { category: "unreachable", message: "mockFailureMode enabled" } };
  return { ok: true, latencyMs: 1 };
}

/** The mock has no separate server-side state to poll — a real lab adapter that only supports polling (no webhook) would implement this for real against the vendor's status endpoint. Documented as a stub, not silently omitted, so the interface's optional-method contract is visibly satisfied. */
async function checkStatus({ externalOrderRef }) {
  return { ok: true, rawStatus: "UNKNOWN", raw: { note: "MOCK_LAB delivers results via simulated webhook only, not polling", externalOrderRef } };
}

/** Builds the webhook payload + signature a real external lab would send back — used only by the admin-triggered "simulate result" test action, never by production code paths. */
function buildResultWebhook({ externalOrderRef, secret, findings, status = "COMPLETED" }) {
  const body = {
    providerEventId: crypto.randomUUID(),
    externalOrderRef,
    status,
    resultedAt: new Date().toISOString(),
    findings: findings || "Simulated result — within normal limits.",
  };
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  return { raw, signature, timestamp };
}

module.exports = { createOrder, cancelOrder, checkConnection, checkStatus, buildResultWebhook };
