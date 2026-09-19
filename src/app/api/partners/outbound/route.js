import { apiRoute, json } from "@/lib/apiRoute";
import { listOutbound, listConnections } from "@/lib/partners";
import { requirePartnerWork } from "@/lib/partnerAccess";

export const dynamic = "force-dynamic";

// What THIS facility has sent to partners, plus the partners it may send to now.
export const GET = apiRoute(null, async (request, { session }) => {
  requirePartnerWork(session);
  const [orders, conns] = await Promise.all([listOutbound(session), listConnections(session)]);
  const targets = conns
    .filter((c) => c.direction === "OUTGOING" && c.status === "ACTIVE")
    .map((c) => ({ connectionId: c.id, name: c.counterparty?.name, serviceType: c.serviceType }));
  return json({ orders, targets });
});
