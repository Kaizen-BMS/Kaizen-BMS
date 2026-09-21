"use strict";

/**
 * External Integration Foundation — provider registry. Mirrors
 * src/lib/pricing.js's Service Master shape (zod schema + row builder +
 * serializer, one file, no framework) — same "small, explicit, no
 * over-engineering" discipline as every other master-data entity in this
 * project.
 *
 * Provider config (base URL, environment, capabilities) lives here.
 * Secrets NEVER do — see src/lib/externalCredentials.js. serializeProvider()
 * never includes anything from external_credentials, by construction (it
 * only ever reads the external_providers row).
 *
 * Real Vendor Integration Readiness: `config` (an existing, previously
 * unused LONGTEXT column) now carries vendor-specific, NON-secret settings
 * — sandbox/production base URLs, auth scheme, custom headers, per-vendor
 * status-code mapping, timeout. No migration was needed for this — the
 * column already existed from the original migration 033, unused until
 * now. `environment` (SANDBOX/PRODUCTION) is now part of the provider's
 * own uniqueness (migration 034) so a tenant can hold a fully separate
 * SANDBOX and PRODUCTION row — and therefore separate credentials, base
 * URLs, and order/webhook history — for the same real vendor, never one
 * row that silently switches environment in place.
 */
const { z } = require("zod");

const PROVIDER_TYPES = ["LAB", "PHARMACY"];
const ENVIRONMENTS = ["SANDBOX", "PRODUCTION"];
const AUTH_TYPES = ["NONE", "API_KEY", "BEARER", "BASIC", "HMAC"];

// Registered adapter codes — see src/lib/providerAdapters/index.js. Kept
// here too so the create-provider form can validate against a known list
// without importing the adapter registry (which requires Node's http
// client machinery) into a pure schema file. Per this task's own explicit
// "do not invent a vendor" instruction, this stays exactly the 2 MOCK
// codes until a real vendor's adapter is actually written — adding a real
// vendor is: append its code here, add its adapter file, register it in
// providerAdapters/index.js. Nothing else in this file needs to change.
const PROVIDER_CODES = ["MOCK_LAB", "MOCK_PHARMACY"];

// Non-secret, vendor-specific configuration — everything a real adapter
// needs to know HOW to call a vendor, as opposed to WHAT secret to send
// (that's externalCredentials.js). Every field is optional because a
// provider is genuinely usable with none of them set (MOCK providers need
// none at all; a real vendor is configured incrementally as its details
// arrive — this task's own "do not invent vendor specifics" rule means the
// shape has to accommodate "not yet filled in").
const configSchema = z
  .object({
    sandboxBaseUrl: z.string().trim().max(500).optional(),
    productionBaseUrl: z.string().trim().max(500).optional(),
    authType: z.enum(AUTH_TYPES).optional(),
    apiKeyHeader: z.string().trim().max(100).optional(), // header name for API_KEY auth, e.g. "x-api-key" — vendor-specific
    timeoutMs: z.coerce.number().int().min(1000).max(120_000).optional(),
    headers: z.record(z.string(), z.string()).optional(), // extra static headers a vendor's API requires
    // Vendor status string -> Kaizen status string, e.g. { "RECEIVED": "ORDERED", "COMPLETED": "RESULTED" }.
    // See src/lib/providerAdapters/statusMapping.js — never assumed to be the same vocabulary across vendors.
    statusMap: z.record(z.string(), z.string()).optional(),
    // MOCK adapters only (TASK 11 — deterministic outbound-failure testing).
    // A real adapter must never read this flag; it exists purely so the
    // existing retry endpoint can be exercised against a genuine failure
    // without weakening any real failure handling to make a test pass.
    mockFailureMode: z.boolean().optional(),
  })
  .partial()
  .optional();

const createProviderSchema = z.object({
  providerType: z.enum(PROVIDER_TYPES),
  providerCode: z.enum(PROVIDER_CODES),
  name: z.string().trim().min(1).max(191),
  baseUrl: z.string().trim().max(500).optional().or(z.literal("")),
  apiVersion: z.string().trim().max(20).optional().or(z.literal("")),
  environment: z.enum(ENVIRONMENTS).optional().default("SANDBOX"),
  capabilities: z.array(z.string()).optional().default([]),
  config: configSchema,
});

const updateProviderSchema = z.object({
  name: z.string().trim().min(1).max(191).optional(),
  baseUrl: z.string().trim().max(500).optional().or(z.literal("")),
  apiVersion: z.string().trim().max(20).optional().or(z.literal("")),
  environment: z.enum(ENVIRONMENTS).optional(),
  active: z.coerce.boolean().optional(),
  capabilities: z.array(z.string()).optional(),
  config: configSchema,
});

// setCredentialSchema — exactly one of `secret` (simple single-value, what
// MOCK providers use) or `fields` (a real vendor's named multi-secret set,
// e.g. { apiKey, webhookSecret, clientId, clientSecret }) must be given.
const setCredentialSchema = z
  .object({
    secret: z.string().trim().min(1).max(4000).optional(),
    fields: z.record(z.string(), z.string().trim().min(1).max(4000)).optional(),
  })
  .refine((v) => (!!v.secret) !== (!!v.fields), { message: "provide exactly one of secret or fields" });

function parseCapabilities(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseConfig(v) {
  if (!v) return {};
  if (typeof v === "object") return v;
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const MOCK_CODES = new Set(["MOCK_LAB", "MOCK_PHARMACY"]);
// Partner (peer Kaizen facility) providers need no base URL either — delivery is in-process.
const needsNoUrl = (code) => MOCK_CODES.has(code) || String(code).startsWith("PEER_");

/** The environment-appropriate base URL — config.sandboxBaseUrl/productionBaseUrl when set, falling back to the legacy single `base_url` column (what every provider used before per-environment URLs existed). MOCK providers need none of this (no real network call is ever made). */
function resolveBaseUrl(row) {
  const config = parseConfig(row.config);
  const fromConfig = row.environment === "PRODUCTION" ? config.productionBaseUrl : config.sandboxBaseUrl;
  return fromConfig || row.base_url || null;
}

// Error categories written by integrationHealth.js/the webhook routes/the
// adapter orchestration layer — grouped here once so deriveHealth() has a
// single place mapping a raw category string to a health STATE, rather
// than every call site inventing its own bucketing.
const AUTH_ERROR_CATEGORIES = new Set(["signature_invalid", "auth_failed", "http_401", "http_403", "unauthorized"]);
const NETWORK_ERROR_CATEGORIES = new Set(["timeout", "network_error", "unreachable"]);

/**
 * Derived health, never stored as its own status column. Precedence,
 * highest first: DISABLED (provider turned off) -> CONFIG_ERROR (missing
 * credential, or missing base URL for a non-MOCK provider) -> AUTH_FAILED /
 * UNREACHABLE (the last real failure was one of those specific kinds) ->
 * DEGRADED (some recent failures, not otherwise categorized) -> HEALTHY
 * (at least one real success, zero outstanding failures) -> CONNECTED
 * (configured correctly, simply never exercised yet). Distinguishing
 * HEALTHY from CONNECTED matters for a real vendor: "configured" is not
 * the same claim as "actually proven reachable," and this file must never
 * claim HEALTHY merely because Kaizen's own database is healthy — every
 * one of these states is derived from an observed provider-side outcome
 * (last_success_at/last_failure_at/last_error_category), never database
 * connectivity.
 */
function deriveHealth(row, { hasCredential } = {}) {
  if (!row.active) return "DISABLED";

  const isMock = needsNoUrl(row.provider_code);
  if (hasCredential === false && !String(row.provider_code).startsWith("PEER_")) return "CONFIG_ERROR";
  if (!isMock && !resolveBaseUrl(row)) return "CONFIG_ERROR";

  if (row.last_error_category && AUTH_ERROR_CATEGORIES.has(row.last_error_category)) return "AUTH_FAILED";
  if (row.last_error_category && NETWORK_ERROR_CATEGORIES.has(row.last_error_category)) return "UNREACHABLE";
  if (row.failure_count > 0) return "DEGRADED";
  if (row.last_success_at) return "HEALTHY";
  return "CONNECTED";
}

/** Layers a connection's own lifecycle status over the provider's derived health — PAUSED/REVOKED/PENDING on the connection always wins, since no call can succeed through it regardless of how healthy the provider itself looks. */
function deriveConnectionHealth(providerRow, connection, opts) {
  if (!connection) return deriveHealth(providerRow, opts);
  if (connection.status === "REVOKED") return "REVOKED";
  if (connection.status === "PAUSED" || connection.status === "SUSPENDED") return "PAUSED";
  if (connection.status === "PENDING") return "PENDING";
  return deriveHealth(providerRow, opts);
}

function serializeProvider(row) {
  if (!row) return null;
  const config = parseConfig(row.config);
  const hasCred = row._hasCredential;
  return {
    id: Number(row.id),
    providerType: row.provider_type,
    providerCode: row.provider_code,
    name: row.name,
    baseUrl: row.base_url,
    apiVersion: row.api_version,
    environment: row.environment,
    active: !!row.active,
    capabilities: parseCapabilities(row.capabilities),
    config,
    resolvedBaseUrl: resolveBaseUrl(row),
    health: deriveHealth(row, { hasCredential: hasCred }),
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    failureCount: row.failure_count,
    lastErrorCategory: row.last_error_category,
    lastLatencyMs: row.last_latency_ms,
    hasCredential: hasCred ?? undefined, // set by the caller when known, never queried here
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  PROVIDER_TYPES,
  ENVIRONMENTS,
  AUTH_TYPES,
  PROVIDER_CODES,
  createProviderSchema,
  updateProviderSchema,
  setCredentialSchema,
  parseCapabilities,
  parseConfig,
  resolveBaseUrl,
  deriveHealth,
  deriveConnectionHealth,
  serializeProvider,
};
