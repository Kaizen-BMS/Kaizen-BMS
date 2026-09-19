import { apiRoute, json } from "@/lib/apiRoute";
import { listFacilitiesForUser } from "@/lib/orgAccess";

export const dynamic = "force-dynamic";

// Facilities the signed-in identity may act in (own facility + every
// facility of organizations they OWN), with real counts. `current` marks
// the ACTIVE facility of this session.
export const GET = apiRoute(null, async (request, { session }) => {
  if (session.tenantId == null) return json({ facilities: [], activeTenantId: null });
  const facilities = await listFacilitiesForUser(session.userId, session.tenantId);
  return json({ facilities, activeTenantId: session.tenantId });
});
