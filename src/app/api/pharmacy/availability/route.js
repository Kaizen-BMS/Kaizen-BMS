import { apiRoute, json } from "@/lib/apiRoute";
import { suggest } from "@/lib/stockSuggest";

export const dynamic = "force-dynamic";

// Doctor-side hint while typing a medicine: available / not available per source.
export const GET = apiRoute("prescription:create", async (request, { session }) => {
  const q = new URL(request.url).searchParams.get("q");
  return json(await suggest(session.tenantId, q));
});
