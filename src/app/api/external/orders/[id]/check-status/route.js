import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { getAdapter } from "@/lib/providerAdapters";
import { resolveAdapterContext } from "@/lib/externalAdapterContext";
import { normalizeStatus } from "@/lib/providerAdapters/statusMapping";
import { recordSuccess, recordFailure } from "@/lib/integrationHealth";

export const dynamic = "force-dynamic";

/**
 * TASK 2/6/7 — "check order status if provider supports it." For a vendor
 * that never pushes a webhook (or as a supplementary visibility check
 * alongside one), pulls the provider's own current status for one
 * ExternalOrder and normalizes it via the provider's configured
 * `config.statusMap` (statusMapping.js) — never assumed to share Kaizen's
 * status vocabulary. Deliberately scoped to updating `external_orders`
 * (outbound tracking/visibility) only, not the internal business record
 * (lab_orders/prescription_items) — those stay webhook-driven, the same
 * single, already-tested inbound path every result/fulfillment goes
 * through, so a poll can never race a webhook into writing two different
 * outcomes for the same order. A provider whose adapter has no
 * checkStatus() gets an honest 501, never a fabricated status.
 */
export const POST = apiRoute("external:manage", async (request, { session, params }) => {
  const { id } = await params;
  const order = await tenantDb.external_orders.findUnique({ where: { id: BigInt(id) } });
  if (!order) throw new HttpError(404, "external_order_not_found");
  if (!order.external_order_ref) throw new HttpError(409, "order_not_yet_sent");

  const provider = await tenantDb.external_providers.findUnique({ where: { id: order.provider_id } });
  if (!provider) throw new HttpError(404, "provider_not_found");

  const adapter = getAdapter(provider.provider_code);
  if (typeof adapter.checkStatus !== "function") {
    throw new HttpError(501, "provider_does_not_support_status_polling");
  }

  const { provider: adapterProvider, credentials } = await resolveAdapterContext(session.tenantId, provider);
  const start = Date.now();
  let result;
  try {
    result = await adapter.checkStatus({ externalOrderRef: order.external_order_ref, provider: adapterProvider, credentials });
  } catch (err) {
    await recordFailure(tenantDb, provider.id, { errorCategory: "adapter_error", latencyMs: Date.now() - start });
    throw new HttpError(502, "external_provider_error");
  }

  if (!result.ok) {
    await recordFailure(tenantDb, provider.id, { errorCategory: "rejected", latencyMs: Date.now() - start });
    return json({ ok: false, rawStatus: result.rawStatus ?? null });
  }
  await recordSuccess(tenantDb, provider.id, { latencyMs: Date.now() - start });

  const { status: normalized, mapped } = normalizeStatus(result.rawStatus, adapterProvider.config?.statusMap, order.status);
  const updated = await tenantDb.external_orders.update({
    where: { id: order.id },
    data: { response_payload: JSON.stringify(result.raw ?? {}) },
  });

  return json({
    ok: true,
    rawStatus: result.rawStatus ?? null,
    normalizedStatus: normalized,
    statusMapped: mapped,
    externalOrder: { id: Number(updated.id), status: updated.status },
  });
});
