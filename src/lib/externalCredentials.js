"use strict";

/**
 * Credential storage/retrieval — deliberately its own tiny module,
 * imported ONLY by the provider-management route (to set/rotate) and the
 * outbound adapter layer (to actually make a call). Never imported by
 * anything that serializes a response — `getSecretForAdapterUse()`'s
 * return value must never be placed on a response object.
 *
 * Real Vendor Integration Readiness: a real vendor commonly needs MORE than
 * one secret value (an API key AND a separate webhook-signing secret, or a
 * client id/secret pair) — the MOCK adapters only ever needed one (an HMAC
 * key doubling as "the credential"). Rather than adding new columns/tables
 * for this, the single `encrypted_secret` blob now MAY hold a JSON object
 * of named fields instead of a bare string — still one encrypted value,
 * same schema, same `external_credentials` row. `getSecretForAdapterUse()`
 * is UNCHANGED (still returns the raw decrypted string) so every existing
 * caller — the MOCK adapters' HMAC signing, the simulate-webhook route —
 * keeps working byte-for-byte. `getCredentialFields()`/`getWebhookSecret()`
 * are the new structured accessors real adapters and the webhook routes
 * use; both transparently wrap a legacy plain-string secret as
 * `{ secret: <the string> }` so old and new credentials behave the same
 * way through the new accessors too.
 */
const { tenantDb } = require("./prismaClient");
const { encryptSecret, decryptSecret } = require("./crypto");

function toId(v) {
  return typeof v === "bigint" ? v : BigInt(v);
}

/**
 * Set or rotate a provider's credential — upsert, so rotating never exposes
 * the previous value (it's simply overwritten). Exactly one of `secret`
 * (a bare string — the simple, single-value case) or `fields` (a named
 * object — e.g. `{ apiKey, webhookSecret, clientId, clientSecret }` for a
 * vendor that needs more than one) is stored; `fields` is JSON-serialized
 * before encryption, `secret` is stored as-is.
 */
async function setCredential(db, { tenantId, providerId, secret, fields, actorUserId }) {
  const plain = fields ? JSON.stringify(fields) : secret;
  if (!plain) throw new Error("setCredential requires either `secret` or `fields`");
  const { ciphertext, iv, authTag } = encryptSecret(plain);
  const existing = await db.external_credentials.findFirst({ where: { provider_id: toId(providerId) } });
  if (existing) {
    return db.external_credentials.update({
      where: { id: existing.id },
      data: { encrypted_secret: ciphertext, iv, auth_tag: authTag, rotated_at: new Date() },
    });
  }
  return db.external_credentials.create({
    data: { tenant_id: toId(tenantId), provider_id: toId(providerId), encrypted_secret: ciphertext, iv, auth_tag: authTag },
  });
}

async function hasCredential(db, providerId) {
  const row = await db.external_credentials.findFirst({ where: { provider_id: toId(providerId) }, select: { id: true } });
  return !!row;
}

/**
 * The ONLY function that ever returns raw plaintext — for the outbound
 * adapter layer's exclusive use. Always re-verifies tenant ownership
 * before decrypting, never trusts a bare providerId. Unchanged since
 * before real-vendor readiness — every existing caller keeps working.
 */
async function getSecretForAdapterUse(tenantId, providerId) {
  const row = await tenantDb.external_credentials.findFirst({
    where: { provider_id: toId(providerId), tenant_id: toId(tenantId) },
  });
  if (!row) return null;
  return decryptSecret({ ciphertext: row.encrypted_secret, iv: row.iv, authTag: row.auth_tag });
}

/** Structured access: parses a JSON-object credential as-is; wraps a legacy/simple plain-string credential as `{ secret }` so callers never have to special-case which shape a given provider was configured with. */
async function getCredentialFields(tenantId, providerId) {
  const raw = await getSecretForAdapterUse(tenantId, providerId);
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON — a plain single-value credential, the common MOCK/simple case
  }
  return { secret: raw };
}

/** The one secret webhook signature verification should ever use — a real vendor's own webhook-signing secret when one was configured separately, else the single stored value (MOCK providers, or a vendor with only one secret total). */
async function getWebhookSecret(tenantId, providerId) {
  const fields = await getCredentialFields(tenantId, providerId);
  if (!fields) return null;
  return fields.webhookSecret ?? fields.secret ?? null;
}

module.exports = { setCredential, hasCredential, getSecretForAdapterUse, getCredentialFields, getWebhookSecret };
