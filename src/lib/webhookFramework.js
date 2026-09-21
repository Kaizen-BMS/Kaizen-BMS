"use strict";

/**
 * Provider-neutral webhook authentication — the shared prefix every
 * inbound webhook route (lab, pharmacy, and any future provider type)
 * runs before its own business-specific transaction: resolve the provider
 * from the URL's routing id -> verify HMAC signature -> verify replay
 * window -> parse JSON -> require a provider event id. Factored out of
 * the near-duplicate lab/pharmacy webhook routes (TASK 8) so a future
 * provider type's webhook route is this call plus its own business logic,
 * never a third copy of the auth/parsing boilerplate.
 *
 * Deliberately stops short of the Inbox-record + contract-validate +
 * business-transaction step — that part genuinely differs per provider
 * type (which internal table gets updated) and stays in each route,
 * inside its own `tenantDb.$transaction()`, exactly as already built and
 * tested.
 *
 * The tenant is ALWAYS resolved from the provider row here — this
 * function is itself the one place that resolution happens, so every
 * webhook route inherits the "never trust tenantId from the payload"
 * guarantee by construction rather than by each route remembering to do
 * it right.
 */
const { prisma } = require("./prismaClient");
const { runWithContext } = require("./requestContext");
const { getWebhookSecret } = require("./externalCredentials");
const { peerWebhookSecret, isPeerProvider } = require("./peerSecret");
const { verifySignature, verifyTimestamp } = require("./webhookAuth");
const { recordFailure } = require("./integrationHealth");
const { isPeerConnectionActive } = require("./partners");

/**
 * Returns `{ ok: true, provider, tenantId, body }` or
 * `{ ok: false, status, error }`. Callers should return the given
 * `status`/`error` verbatim as the HTTP response on failure — every
 * failure path has already recorded the provider-health signal (a
 * signature/replay failure counts toward AUTH_FAILED, same as before).
 */
async function authenticateWebhook({ providerId, providerType, rawBody, signatureHeader, timestampHeader }) {
  const provider = await prisma.external_providers.findUnique({ where: { id: BigInt(providerId) } });
  if (!provider || provider.provider_type !== providerType) {
    return { ok: false, status: 404, error: "not_found" };
  }

  const tenantIdForSecret = Number(provider.tenant_id);
  const secret = isPeerProvider(provider.provider_code)
    ? peerWebhookSecret(provider.id)
    : await runWithContext({ tenantId: tenantIdForSecret }, async () => {
        return await getWebhookSecret(tenantIdForSecret, provider.id);
      });
  if (!secret || !verifySignature(rawBody, signatureHeader, secret)) {
    await recordFailure(prisma, provider.id, { errorCategory: "signature_invalid" });
    return { ok: false, status: 401, error: "invalid_signature" };
  }
  if (!verifyTimestamp(timestampHeader)) {
    await recordFailure(prisma, provider.id, { errorCategory: "replay_window" });
    return { ok: false, status: 401, error: "timestamp_out_of_window" };
  }

  // A partner (peer facility) provider only exchanges data while its
  // consent-based connection is ACTIVE — paused/revoked connections are
  // refused here even with a valid signature.
  if (String(provider.provider_code).startsWith("PEER_")) {
    let cfg = {};
    try { cfg = JSON.parse(provider.config || "{}"); } catch { /* ignore */ }
    if (!provider.active || !(await isPeerConnectionActive(cfg.peerConnectionId))) {
      return { ok: false, status: 403, error: "connection_not_active" };
    }
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
  if (!body.providerEventId) {
    return { ok: false, status: 400, error: "missing_provider_event_id" };
  }

  return { ok: true, provider, tenantId: tenantIdForSecret, body };
}

module.exports = { authenticateWebhook };
