"use strict";

/**
 * Generic outbound HTTP client for provider adapters — timeout, bounded
 * retry with exponential backoff, auth injection, correlation IDs, and
 * normalized errors, so provider-specific adapter code never has to
 * reimplement any of this (see src/lib/providerAdapters/). Uses Node's
 * built-in `fetch` — no new package.
 *
 * Retry discipline, per the External Integration Blueprint's own Part 8:
 * only retry when the CALLER declares the operation safe to retry
 * (`idempotent: true`) — a bare POST that creates an order is NEVER
 * retried blindly by this client; the caller decides, the same way this
 * project's own Outbox only retries side effects it already knows are
 * safe to redeliver.
 *
 * Real Vendor Integration Readiness: `auth` builds the actual request
 * headers for whichever scheme a real vendor uses (API key header, Bearer
 * token, Basic auth, or an HMAC signature over the request body) — a real
 * adapter passes `{ type, ...credentials }` (from
 * externalCredentials.js's getCredentialFields()) instead of hand-rolling
 * header logic per vendor. Every call also carries a generated
 * correlation id (`x-correlation-id`) for tracing a request across
 * Kaizen's logs and a vendor's own support ticket. Debug logging (opt-in,
 * OFF by default) NEVER logs header values or the request/response body —
 * only method/url/status/latency/correlation id — so it can be safely left
 * on in a lower environment without becoming a credential leak.
 */
const crypto = require("crypto");

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

function backoffMs(attempt) {
  return Math.min(500 * 2 ** attempt, 4000);
}

/**
 * Builds the auth headers (and, for HMAC, signs the exact serialized body)
 * for one of this project's supported schemes. Returns `{}` for
 * `NONE`/missing auth — never throws on an incomplete config; a real
 * vendor adapter should treat a resulting 401 as the signal credentials
 * are misconfigured (surfaced via integrationHealth.js's AUTH_FAILED
 * category), not something this transport layer guesses at.
 */
function buildAuthHeaders({ type, apiKey, apiKeyHeader, bearerToken, basicUser, basicPass, hmacSecret, hmacHeader }, serializedBody) {
  switch (type) {
    case "API_KEY":
      return apiKey ? { [apiKeyHeader || "x-api-key"]: apiKey } : {};
    case "BEARER":
      return bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {};
    case "BASIC":
      return basicUser && basicPass ? { Authorization: `Basic ${Buffer.from(`${basicUser}:${basicPass}`).toString("base64")}` } : {};
    case "HMAC": {
      if (!hmacSecret) return {};
      const signature = crypto.createHmac("sha256", hmacSecret).update(serializedBody || "", "utf8").digest("hex");
      return { [hmacHeader || "x-signature"]: signature };
    }
    default:
      return {};
  }
}

/** Never logs header values, credentials, or body content — only shape/timing, safe to leave enabled. */
function safeDebugLog({ method, url, status, latencyMs, correlationId, error }) {
  if (process.env.EXTERNAL_INTEGRATION_DEBUG !== "1") return;
  console.log(
    `[outboundClient] ${method} ${new URL(url).origin}${new URL(url).pathname} -> ${status ?? "ERR"} (${latencyMs}ms) [${correlationId}]${error ? ` error=${error.category}` : ""}`,
  );
}

/**
 * `opts`: { method, url, headers, body, timeoutMs, idempotent, maxRetries, auth, correlationId }
 * Returns `{ ok, status, data, error, latencyMs, correlationId }` — never
 * throws for a normal HTTP-level failure (timeout, non-2xx, network
 * error); only a programmer error (e.g. a malformed URL) throws.
 */
async function callProvider({ method = "POST", url, headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS, idempotent = false, maxRetries = MAX_RETRIES, auth }) {
  const attempts = idempotent ? maxRetries : 1;
  let lastError = null;
  const start = Date.now();
  const correlationId = crypto.randomUUID();
  const serializedBody = body !== undefined ? JSON.stringify(body) : undefined;
  const authHeaders = auth ? buildAuthHeaders(auth, serializedBody) : {};

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-correlation-id": correlationId, ...authHeaders, ...headers },
        body: serializedBody,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (res.ok) {
        safeDebugLog({ method, url, status: res.status, latencyMs, correlationId });
        return { ok: true, status: res.status, data, error: null, latencyMs, correlationId };
      }
      // 401/403 categorized distinctly (never bucketed as a generic
      // "http_error") so integrationHealth.js/deriveHealth() can surface
      // AUTH_FAILED specifically — a wrong API key looks nothing like a
      // vendor outage, and an admin needs to know which one it is.
      const category = res.status === 401 || res.status === 403 ? `http_${res.status}` : "http_error";
      lastError = { category, message: `HTTP ${res.status}` };
      safeDebugLog({ method, url, status: res.status, latencyMs, correlationId, error: lastError });
      if (!idempotent || res.status < 500 || attempt === attempts - 1) {
        return { ok: false, status: res.status, data, error: lastError, latencyMs, correlationId };
      }
    } catch (err) {
      clearTimeout(timer);
      const category = err.name === "AbortError" ? "timeout" : "network_error";
      lastError = { category, message: err.message };
      safeDebugLog({ method, url, status: null, latencyMs: Date.now() - start, correlationId, error: lastError });
      if (!idempotent || attempt === attempts - 1) {
        return { ok: false, status: null, data: null, error: lastError, latencyMs: Date.now() - start, correlationId };
      }
    }
    await new Promise((r) => setTimeout(r, backoffMs(attempt)));
  }
  return { ok: false, status: null, data: null, error: lastError, latencyMs: Date.now() - start, correlationId };
}

module.exports = { callProvider, buildAuthHeaders, DEFAULT_TIMEOUT_MS, MAX_RETRIES };
