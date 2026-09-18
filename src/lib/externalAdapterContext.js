"use strict";

/**
 * Shared by externalLab.js/externalPharmacy.js: builds the exact
 * `{ provider, credentials }` pair every adapter's createOrder()/
 * checkStatus()/checkConnection() receives — see providerAdapters/
 * index.js's interface doc for what each field means. One place this
 * assembly happens, not two copies that could drift (same reasoning as
 * bookAppointment()/resolveTokenNumber() elsewhere in this codebase).
 */
const { HttpError } = require("./apiRoute");
const { getCredentialFields } = require("./externalCredentials");
const { resolveBaseUrl, parseConfig } = require("./externalProviders");

const MOCK_CODES = new Set(["MOCK_LAB", "MOCK_PHARMACY"]);

/** Fails fast, with a clean actionable error, when a real (non-MOCK) provider has no credential configured yet, rather than letting the adapter throw something confusing mid-call. */
async function resolveAdapterContext(tenantId, providerRow) {
  const credentials = await getCredentialFields(tenantId, providerRow.id);
  if (!MOCK_CODES.has(providerRow.provider_code) && !credentials) {
    throw new HttpError(409, "provider_credential_not_configured");
  }
  const provider = {
    id: Number(providerRow.id),
    name: providerRow.name,
    providerType: providerRow.provider_type,
    providerCode: providerRow.provider_code,
    environment: providerRow.environment,
    baseUrl: resolveBaseUrl(providerRow),
    config: parseConfig(providerRow.config),
  };
  return { provider, credentials };
}

module.exports = { resolveAdapterContext, MOCK_CODES };
