import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { serializeProvider } from "@/lib/externalProviders";
import { hasCredential } from "@/lib/externalCredentials";

export const dynamic = "force-dynamic";

// Integration Monitoring (this task's "E" requirement) — connection status,
// last success/failure, latency, failure count, pending outbound ops,
// failed inbound events, recent provider errors. Never exposes secrets or
// raw webhook/order payloads — counts and small summaries only.
export const GET = apiRoute("external:read", async (request, { params }) => {
  const { id } = await params;
  const provider = await tenantDb.external_providers.findUnique({ where: { id: BigInt(id) } });
  if (!provider) throw new HttpError(404, "provider_not_found");

  const [hasCred, pendingOrders, failedOrders, failedWebhooks, recentFailedWebhooks] = await Promise.all([
    hasCredential(tenantDb, provider.id),
    tenantDb.external_orders.count({ where: { provider_id: provider.id, status: { in: ["PENDING", "SENT", "ACKNOWLEDGED", "PROCESSING"] } } }),
    tenantDb.external_orders.count({ where: { provider_id: provider.id, status: "FAILED" } }),
    tenantDb.webhook_events.count({ where: { provider_id: provider.id, status: "FAILED" } }),
    tenantDb.webhook_events.findMany({
      where: { provider_id: provider.id, status: "FAILED" },
      orderBy: { received_at: "desc" },
      take: 10,
      select: { id: true, event_type: true, last_error: true, attempts: true, received_at: true },
    }),
  ]);

  return json({
    provider: serializeProvider({ ...provider, _hasCredential: hasCred }),
    pendingOutboundOrders: pendingOrders,
    failedOutboundOrders: failedOrders,
    failedInboundEvents: failedWebhooks,
    recentFailedWebhooks: recentFailedWebhooks.map((w) => ({
      id: Number(w.id),
      eventType: w.event_type,
      lastError: w.last_error,
      attempts: w.attempts,
      receivedAt: w.received_at,
    })),
  });
});
