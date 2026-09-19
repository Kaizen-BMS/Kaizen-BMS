import { apiRoute, json } from "@/lib/apiRoute";
import { lookupByCode } from "@/lib/partners";

export const dynamic = "force-dynamic";

// Returns ONLY minimal public information (name, type, what it offers) for
// an exactly-entered public facility code — nothing else about the other
// organization is readable before it consents.
export const GET = apiRoute("partner:manage", async (request, { session }) => {
  const code = new URL(request.url).searchParams.get("code");
  return json({ partner: await lookupByCode(session, code) });
});
