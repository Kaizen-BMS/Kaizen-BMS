"use strict";

/**
 * Mock/Sandbox Pharmacy adapter — same reasoning as mockLabAdapter.js.
 * Never presented as a real provider. See providerAdapters/index.js's
 * interface doc and mockLabAdapter.js's own comments for the full
 * explanation of `provider`/`credentials`/`mockFailureMode`.
 */
const crypto = require("crypto");

async function createOrder({ payload, provider }) {
  if (provider?.config?.mockFailureMode) {
    throw new Error("MOCK_PROVIDER_MODE=FAIL — simulated outbound failure for retry testing");
  }
  const externalOrderRef = `MOCKRX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  return { ok: true, externalOrderRef, raw: { accepted: true, orderId: externalOrderRef, medicineName: payload.medicineName, quantity: payload.quantity } };
}

async function cancelOrder({ externalOrderRef }) {
  return { ok: true, raw: { cancelled: externalOrderRef } };
}

async function checkConnection({ provider }) {
  if (provider?.config?.mockFailureMode) return { ok: false, latencyMs: 1, error: { category: "unreachable", message: "mockFailureMode enabled" } };
  return { ok: true, latencyMs: 1 };
}

async function checkStatus({ externalOrderRef }) {
  return { ok: true, rawStatus: "UNKNOWN", raw: { note: "MOCK_PHARMACY delivers fulfillment via simulated webhook only, not polling", externalOrderRef } };
}

function buildFulfillmentWebhook({ externalOrderRef, secret, quantityFulfilled, status = "COMPLETED" }) {
  const body = {
    providerEventId: crypto.randomUUID(),
    externalOrderRef,
    status,
    quantityFulfilled: quantityFulfilled ?? null,
  };
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  return { raw, signature, timestamp };
}

module.exports = { createOrder, cancelOrder, checkConnection, checkStatus, buildFulfillmentWebhook };
