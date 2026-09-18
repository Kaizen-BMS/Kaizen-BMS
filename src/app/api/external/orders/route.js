import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { serializeExternalOrder } from "@/lib/externalOrders";

export const dynamic = "force-dynamic";

// Read-only outbound-order list for the Connection Center's monitoring
// panel — pending/failed counts, recent activity. No raw request/response
// payload is returned (they can carry provider-side detail beyond what an
// admin screen needs) — only the tracking fields serializeExternalOrder()
// already exposes.
export const GET = apiRoute("external:read", async (request) => {
  const url = new URL(request.url);
  const providerId = url.searchParams.get("providerId");
  const status = url.searchParams.get("status");

  const where = {};
  if (providerId) where.provider_id = BigInt(providerId);
  if (status) where.status = status;

  const orders = await tenantDb.external_orders.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: 100,
  });
  return json({ orders: orders.map(serializeExternalOrder) });
});
