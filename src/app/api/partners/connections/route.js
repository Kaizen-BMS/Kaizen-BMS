import { apiRoute, json } from "@/lib/apiRoute";
import { listConnections } from "@/lib/partners";

export const dynamic = "force-dynamic";

// Both sides see the same relationship from their own point of view
// (direction OUTGOING/INCOMING); neither side gets the other's tenant.
export const GET = apiRoute("partner:manage", async (request, { session }) => {
  return json({ connections: await listConnections(session) });
});
