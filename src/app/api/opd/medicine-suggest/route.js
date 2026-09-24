import { apiRoute, json } from "@/lib/apiRoute";
import { requireTenantId } from "@/lib/requestContext";
import { suggestMedicines } from "@/lib/medicineSuggest";

export const dynamic = "force-dynamic";

// Same catalog type-ahead the pharmacy uses, for the doctor's prescription
// screen — so a medicine has the identical name in both places.
export const GET = apiRoute("prescription:create", async (request) => {
  const q = new URL(request.url).searchParams.get("q");
  return json({ items: await suggestMedicines(requireTenantId(), q) });
});
