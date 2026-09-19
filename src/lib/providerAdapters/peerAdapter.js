"use strict";

/**
 * Adapter for a partner that is ANOTHER Kaizen facility (provider_code
 * `PEER_LAB:<id>` / `PEER_PHARMACY:<id>`). No network hop is needed: the
 * order is delivered straight into the partner's inbox by partners.js, which
 * independently re-verifies that the connection is ACTIVE, the consent is
 * current, and the payload holds only approved fields. Results come back
 * through the SAME signed-webhook pipeline every other provider uses.
 */
const partners = require("../partners");

async function createOrder({ payload, provider }) {
  const connectionId = provider?.config?.peerConnectionId;
  if (!connectionId) throw new Error("peer_connection_missing");
  const externalOrderRef = await partners.deliverPeerOrder(connectionId, payload);
  return { ok: true, externalOrderRef, raw: { delivered: true, ref: externalOrderRef } };
}

async function checkConnection({ provider }) {
  const active = await partners.isPeerConnectionActive(provider?.config?.peerConnectionId);
  return active ? { ok: true, latencyMs: 0 } : { ok: false, latencyMs: 0, error: { category: "unreachable", message: "partner connection is not active" } };
}

module.exports = { createOrder, checkConnection };
