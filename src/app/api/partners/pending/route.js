import { apiRoute, json } from "@/lib/apiRoute";
import { pendingIncoming } from "@/lib/partners";

export const dynamic = "force-dynamic";

// Persistent (database-backed) list of requests awaiting THIS facility's
// decision — the popup reads it on login/refresh, so an offline receiver
// still sees the request; the websocket event is only a live nudge.
export const GET = apiRoute("partner:manage", async (request, { session }) => {
  return json({ requests: await pendingIncoming(session.tenantId) });
});
