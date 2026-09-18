import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { getWebhookSecret } from "@/lib/externalCredentials";
import { getAdapter } from "@/lib/providerAdapters";

export const dynamic = "force-dynamic";

/**
 * Admin-triggered "simulate provider webhook" — the one place the mock
 * adapters' buildResultWebhook()/buildFulfillmentWebhook() helpers are
 * actually used. Makes a REAL HTTP call, with a real HMAC signature, to
 * Kaizen's own webhook endpoint (src/app/api/webhooks/{lab,pharmacy}/
 * [providerId]) — exercising the genuine inbound pipeline (auth,
 * signature, replay window, Inbox idempotency, contract validation,
 * business transaction, realtime) end-to-end over real HTTP, not a
 * function call. This is honest about what's simulated: only the
 * "provider decided to call us" trigger — everything downstream of that
 * HTTP request is the real production code path.
 */
const bodySchema = z.object({
  externalOrderRef: z.string().trim().min(1),
  findings: z.string().trim().max(2000).optional(),
  quantityFulfilled: z.coerce.number().int().min(0).optional(),
  status: z.enum(["COMPLETED", "REJECTED"]).optional().default("COMPLETED"),
});

export const POST = apiRoute("external:manage", async (request, { session, params }) => {
  const { id } = await params;
  const provider = await tenantDb.external_providers.findUnique({ where: { id: BigInt(id) } });
  if (!provider) throw new HttpError(404, "provider_not_found");
  if (!["MOCK_LAB", "MOCK_PHARMACY"].includes(provider.provider_code)) {
    throw new HttpError(409, "simulate_only_supported_for_mock_providers");
  }

  const secret = await getWebhookSecret(session.tenantId, provider.id);
  if (!secret) throw new HttpError(409, "no_credential_configured");

  const body = await parseBody(request, bodySchema);
  const adapter = getAdapter(provider.provider_code);

  let webhookRequest;
  let path;
  if (provider.provider_type === "LAB") {
    webhookRequest = adapter.buildResultWebhook({ externalOrderRef: body.externalOrderRef, secret, findings: body.findings, status: body.status });
    path = `/api/webhooks/lab/${provider.id}`;
  } else {
    webhookRequest = adapter.buildFulfillmentWebhook({ externalOrderRef: body.externalOrderRef, secret, quantityFulfilled: body.quantityFulfilled, status: body.status });
    path = `/api/webhooks/pharmacy/${provider.id}`;
  }

  // Sent as the exact `raw` bytes the signature was computed over — routed
  // through fetch() directly rather than outboundClient.callProvider()
  // (which JSON.stringify()s its `body` argument itself, and re-serializing
  // an already-serialized string would break the signature match).
  const origin = new URL(request.url).origin;
  let webhookResponse;
  try {
    const res = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": webhookRequest.signature,
        "x-webhook-timestamp": webhookRequest.timestamp,
      },
      body: webhookRequest.raw,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    webhookResponse = { status: res.status, ok: res.ok, data };
  } catch (err) {
    webhookResponse = { status: null, ok: false, error: err.message };
  }

  return json({ simulatedRequest: JSON.parse(webhookRequest.raw), webhookResponse });
});
