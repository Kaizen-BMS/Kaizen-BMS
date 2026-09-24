import { apiRoute, json } from "@/lib/apiRoute";
import { requireTenantId } from "@/lib/requestContext";
import { suggestMedicines } from "@/lib/medicineSuggest";

export const dynamic = "force-dynamic";

export const GET = apiRoute("medicine:read", async (request) => {
  const q = new URL(request.url).searchParams.get("q");
  return json({ items: await suggestMedicines(requireTenantId(), q) });
});
