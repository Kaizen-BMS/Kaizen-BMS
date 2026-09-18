import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { getAdapter } from "@/lib/providerAdapters";
import { resolveAdapterContext } from "@/lib/externalAdapterContext";
import { recordSuccess, recordFailure } from "@/lib/integrationHealth";

export const dynamic = "force-dynamic";

/**
 * TASK 13 — Integration Monitoring: "health should be based on a safe
 * provider connectivity check where supported." Calls the adapter's own
 * optional `checkConnection()` (a side-effect-free reachability/auth
 * check — never an order-creating call) and records the real outcome via
 * the same integrationHealth.js functions every real send already uses,
 * so this shows up in the provider's own health/last-success/last-failure
 * exactly like a genuine operation would. A provider whose adapter does
 * not implement checkConnection() gets an honest 501 — never a fabricated
 * "connected."
 */
export const POST = apiRoute("external:manage", async (request, { session, params }) => {
  const { id } = await params;
  const provider = await tenantDb.external_providers.findUnique({ where: { id: BigInt(id) } });
  if (!provider) throw new HttpError(404, "provider_not_found");

  const adapter = getAdapter(provider.provider_code);
  if (typeof adapter.checkConnection !== "function") {
    throw new HttpError(501, "provider_does_not_support_connectivity_check");
  }

  const { provider: adapterProvider, credentials } = await resolveAdapterContext(session.tenantId, provider);
  const result = await adapter.checkConnection({ provider: adapterProvider, credentials });

  if (result.ok) {
    await recordSuccess(tenantDb, provider.id, { latencyMs: result.latencyMs });
  } else {
    await recordFailure(tenantDb, provider.id, { errorCategory: result.error?.category || "unreachable", latencyMs: result.latencyMs });
  }

  return json({ ok: result.ok, latencyMs: result.latencyMs ?? null, error: result.error ?? null });
});
