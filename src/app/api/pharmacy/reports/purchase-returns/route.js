import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { requireTenantId } from "@/lib/requestContext";
import { getPurchaseReturnReport } from "@/lib/pharmacyReports";

export const dynamic = "force-dynamic";

export const GET = apiRoute("pharmacy:reports", async (request) => {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  
  try {
    return json({ rows: await getPurchaseReturnReport(BigInt(requireTenantId()), { from, to }) });
  } catch (err) {
    if (typeof err.status === "number") throw new HttpError(err.status, err.message);
    throw err;
  }
});
