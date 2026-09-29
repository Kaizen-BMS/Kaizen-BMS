import { apiRoute, json } from "@/lib/apiRoute";
import { partnerStock } from "@/lib/partners";
import { requirePartnerWork } from "@/lib/partnerAccess";

export const dynamic = "force-dynamic";

// A connected partner pharmacy's stock, name + available only — backs the
// typeahead in "Ask a partner pharmacy for a medicine" so a request can be
// built from what's actually there instead of guessing blind.
export const GET = apiRoute(null, async (request, { session, params }) => {
  requirePartnerWork(session);
  const { id } = await params;
  const q = new URL(request.url).searchParams.get("q");
  return json(await partnerStock(session, id, q));
});
