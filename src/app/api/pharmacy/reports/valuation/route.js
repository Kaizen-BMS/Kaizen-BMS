import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { requireTenantId } from "@/lib/requestContext";
import { getStockValuation } from "@/lib/pharmacyReports";

export const dynamic = "force-dynamic";

export const GET = apiRoute("pharmacy:reports", async (request) => {
  const moduleInstanceId = new URL(request.url).searchParams.get("moduleInstanceId") || undefined;
  try {
    return json(await getStockValuation(BigInt(requireTenantId()), { moduleInstanceId }));
  } catch (err) {
    if (typeof err.status === "number") throw new HttpError(err.status, err.message);
    throw err;
  }
});
