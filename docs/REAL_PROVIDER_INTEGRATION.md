# Connecting a real Lab or Pharmacy vendor

This is the one document to read before wiring up a real external Lab or
Pharmacy provider. The architecture is already built and live-verified
against a MOCK/SANDBOX adapter — connecting a real vendor is *configuration
plus one small adapter file*, never a redesign.

```
ExternalProvider  →  ExternalConnection  →  ProviderAdapter  →  HTTP Client  →  Real Vendor API
```

No real vendor is connected today. Everything below describes how to add
one once you have that vendor's actual documentation and credentials —
nothing here invents a vendor, an endpoint, or a payload shape.

## 1. Register the provider

`POST /api/external/providers` (or the "Register provider" button under
**Dashboard → Administration → External Integrations**):

```json
{
  "providerType": "LAB",
  "providerCode": "MOCK_LAB",
  "name": "Acme Diagnostics — Sandbox",
  "environment": "SANDBOX"
}
```

`providerCode` must currently be `MOCK_LAB` or `MOCK_PHARMACY` — see step 4
for adding a real one. **Sandbox and Production are separate provider
rows**, not one row you flip an environment flag on (each gets its own
base URL, credentials, and order/webhook history — see migration
`034_external_provider_environment.sql`). Register both when you're ready
to go live: same `providerCode`, `environment: "SANDBOX"` and
`environment: "PRODUCTION"` as two rows.

## 2. Configure sandbox (and later, production)

`PATCH /api/external/providers/[id]` (or the "Edit" button), `config`:

```json
{
  "config": {
    "sandboxBaseUrl": "https://sandbox.acmelab.com/api/v1",
    "productionBaseUrl": "https://api.acmelab.com/v1",
    "authType": "API_KEY",
    "apiKeyHeader": "x-api-key",
    "timeoutMs": 15000,
    "statusMap": { "RECEIVED": "ORDERED", "IN_LAB": "IN_PROGRESS", "DONE": "RESULTED", "VOID": "CANCELLED" }
  }
}
```

`config` is non-secret vendor settings only — `authType` is one of `NONE` /
`API_KEY` / `BEARER` / `BASIC` / `HMAC` (see `src/lib/outboundClient.js`'s
`buildAuthHeaders()`). The provider's own `environment` field decides which
of `sandboxBaseUrl`/`productionBaseUrl` is actually used
(`src/lib/externalProviders.js`'s `resolveBaseUrl()`); falls back to the
legacy single `baseUrl` field if neither is set.

## 3. Configure credentials

`PUT /api/external/providers/[id]/credential` — exactly one of:

```json
{ "secret": "a-single-value" }
```

or, when the vendor gave you more than one secret:

```json
{ "fields": { "apiKey": "...", "webhookSecret": "...", "clientId": "...", "clientSecret": "..." } }
```

Encrypted (AES-256-GCM) via the existing `external_credentials` mechanism
— never returned by any API response, never logged. `webhookSecret` is
what inbound webhook signature verification checks against
(`getWebhookSecret()` in `src/lib/externalCredentials.js`); everything else
is available to your adapter as `credentials.<fieldName>`.

## 4. Where the adapter code goes

`src/lib/providerAdapters/<vendorCode>Adapter.js` (mirror
`mockLabAdapter.js`/`mockPharmacyAdapter.js`'s shape), then register it in
`src/lib/providerAdapters/index.js`'s `ADAPTERS` map and add its code to
`PROVIDER_CODES` in `src/lib/externalProviders.js`. See
`providerAdapters/index.js`'s own header comment for the full interface —
summarized here:

| Function | Required? | Purpose |
|---|---|---|
| `createOrder({ payload, provider, credentials })` | Yes | Send the order to the vendor. Returns `{ ok, externalOrderRef, raw }`. |
| `cancelOrder({ externalOrderRef, provider, credentials })` | No | Cancel an already-sent order, if the vendor supports it. |
| `checkStatus({ externalOrderRef, provider, credentials })` | No | Poll status for a vendor that doesn't push webhooks. |
| `checkConnection({ provider, credentials })` | No | A safe, side-effect-free reachability/auth check, used by "Test connection." |

`provider.baseUrl` is already environment-resolved; `provider.config` is
the parsed, non-secret settings from step 2; `credentials` is the parsed
result of `getCredentialFields()` (or `null` if none is configured — a
real, non-MOCK adapter is never even called in that case, see
`externalAdapterContext.js`'s `resolveAdapterContext()`).

## 5. Implement `sendOrder()`

Use the shared HTTP client — timeout, retry, auth headers, correlation id
are all handled for you:

```js
const { callProvider } = require("../outboundClient");

async function createOrder({ payload, provider, credentials }) {
  const result = await callProvider({
    method: "POST",
    url: `${provider.baseUrl}/orders`,
    body: mapKaizenPayloadToVendor(payload), // step 6
    timeoutMs: provider.config.timeoutMs,
    idempotent: false, // an order-creation POST is not safe to blindly retry — see below
    auth: { type: provider.config.authType, apiKey: credentials.apiKey, apiKeyHeader: provider.config.apiKeyHeader },
  });
  if (!result.ok) return { ok: false, raw: result.data };
  return { ok: true, externalOrderRef: result.data.vendorOrderId, raw: result.data };
}
```

Only pass `idempotent: true` if the vendor's own API guarantees that
resubmitting the exact same order is safe (an idempotency key it honors,
or a genuinely side-effect-free operation) — never for a bare
order-creation POST, per this project's own outbound-retry rule.

## 6. Map the provider's response into Kaizen's shape

Never let vendor field names (`provider_patient_id`, `test_code`,
`result_value`, …) leak into business logic. Write a small mapper inside
your adapter file:

```js
function mapKaizenPayloadToVendor(payload) {
  return { patient_ref: payload.providerPatientId, test_code: payload.providerTestCode, priority: payload.priority };
}
```

`payload.providerPatientId`/`payload.providerTestCode` are already
populated for you, when a mapping exists (step 8) — see
`EXTERNAL_LAB_ORDER`'s contract in `src/lib/dataContracts.js`.

## 7. Implement webhook handling

Nothing to write here — `src/app/api/webhooks/lab/[providerId]/route.js`
(and the pharmacy equivalent) already handle signature verification,
replay protection, Inbox idempotency, and the business update, using
`src/lib/webhookFramework.js`'s shared `authenticateWebhook()`. Give the
vendor this URL: `https://<your-domain>/api/webhooks/lab/<providerId>`
(the numeric id from step 1's response) plus your `webhookSecret` from
step 3, in whatever way their dashboard asks for a callback URL + signing
secret. If their signature scheme genuinely isn't HMAC-SHA256-over-the-raw-
body with an `x-webhook-signature`/`x-webhook-timestamp` header pair,
that's the one place a real vendor might need a small, isolated change —
flag it rather than forcing their scheme into this shape.

## 8. Map external IDs

`src/lib/externalIdentifiers.js`'s `mapExternalId()`/`resolveExternalId()`
work for any entity type — `LAB_ORDER`/`PRESCRIPTION_ITEM` are already
wired in; `PATIENT` and `SERVICE` (test/medicine) are read automatically
by `externalLab.js`/`externalPharmacy.js` if a mapping exists, but nothing
creates a `PATIENT` mapping yet (no vendor has asked for a persistent
patient ID so far). If yours does, call `mapExternalId()` from your
adapter (or a small step before `createOrder()`) the first time you learn
the vendor's own patient id.

## 9. Map statuses

Vendors don't share a status vocabulary. Set `config.statusMap` (step 2)
and use `src/lib/providerAdapters/statusMapping.js`'s `normalizeStatus()`
wherever you turn a vendor's raw status string into a Kaizen one — never
hardcode a vendor's specific status strings in business logic.

## 10. How to test

This project has no automated test framework — verification is live,
against the running dev server, the same way every other module here was
built and verified:

1. Register the provider (sandbox), set config + credentials.
2. **Test connection** button (or `POST /api/external/providers/[id]/test-connection`) —
   confirms your `checkConnection()` (if implemented) actually reaches the
   sandbox.
3. Connect it to a `DOCTOR_OPD` instance (Connection Center), approve.
4. Send a real lab order / prescription item (`POST /api/lab/orders/[id]/send-external`
   or the pharmacy equivalent) and confirm an `ExternalOrder` is created
   and `externalOrderRef` comes back from the vendor's real sandbox.
5. Trigger the vendor's real result/fulfillment webhook (or ask them to,
   from their own sandbox dashboard) and confirm the internal
   `lab_orders`/`prescription_items` row updates and `lab:result`/
   `dispense:created` fire.
6. Force a failure (a bad API key, or the vendor's own sandbox failure
   mode if they have one) and confirm the order reaches `FAILED`, then use
   the **Retry** button and confirm it recovers.
7. Check `/api/external/providers/[id]/health` shows the health state you
   expect (AUTH_FAILED for a bad key, HEALTHY after a real success, etc.).

## 11. Moving sandbox → production

Register a second provider row (`environment: "PRODUCTION"`), with its own
production credentials and `productionBaseUrl` already set from step 2.
Connect it separately in the Connection Center. The sandbox row keeps
existing, untouched, so you can always test again without touching
production — there is no in-place "promote" step, and no code change.

## 12. What to request from the vendor before starting

See the checklists below — gather these BEFORE writing the adapter file,
not while writing it.

---

## REAL LAB VENDOR CHECKLIST

- [ ] API documentation
- [ ] Sandbox URL
- [ ] Production URL
- [ ] Authentication scheme (API key / Bearer / Basic / HMAC / OAuth2)
- [ ] API credentials (sandbox, then production)
- [ ] Patient/order creation API — request/response shape
- [ ] Test codes / catalog (their own test identifiers)
- [ ] Result format (values, units, reference ranges, flags)
- [ ] Status values and their meaning (their vocabulary → Kaizen's)
- [ ] Webhook callback URL registration process
- [ ] Webhook signing/verification scheme
- [ ] Retry/delivery guarantees (at-least-once? exactly-once? none?)
- [ ] Rate limits
- [ ] Idempotency support (can a duplicate order-creation call be made safe?)
- [ ] Sandbox test cases / test patients they provide

## REAL PHARMACY VENDOR CHECKLIST

- [ ] API documentation
- [ ] Sandbox URL
- [ ] Production URL
- [ ] Authentication scheme
- [ ] API credentials (sandbox, then production)
- [ ] Medicine/order creation API — request/response shape
- [ ] Fulfillment/dispense status API or webhook
- [ ] Status values and their meaning
- [ ] Webhook callback URL registration process
- [ ] Webhook signing/verification scheme
- [ ] Retry/delivery guarantees
- [ ] Rate limits
- [ ] Idempotency support
- [ ] Sandbox test cases

---

## What this architecture deliberately does NOT do

- It does not deduct `pharmacy_stock` for an externally-fulfilled
  prescription line, ever, regardless of vendor. Internal and external
  inventory stay isolated by construction.
- It does not trust `tenantId`, internal ids, or any identity claim from a
  webhook payload — the tenant and provider are always resolved from the
  authenticated, pre-configured connection, never the request body.
- It does not claim exactly-once webhook delivery. Idempotency (a real
  unique constraint on `(provider_id, provider_event_id)`) makes a
  redelivered webhook a safe no-op; it does not make delivery itself
  guaranteed-once by the vendor.
- It does not invent a vendor's payload shape, status vocabulary, or
  endpoint. Every one of those is vendor-supplied configuration or a
  vendor-specific adapter file, never hardcoded into shared business logic.
