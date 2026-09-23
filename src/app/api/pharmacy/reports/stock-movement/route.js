import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { requireTenantId } from "@/lib/requestContext";
import { getStockMovementReport } from "@/lib/pharmacyReports";

export const dynamic = "force-dynamic";

export const GET = apiRoute("pharmacy:reports", async (request) => {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
    const type = searchParams.get("type") || undefined;
  try {
    return json({ rows: await getStockMovementReport(BigInt(requireTenantId()), { from, to, type }) });
  } catch (err) {
    if (typeof err.status === "number") throw new HttpError(err.status, err.message);
    throw err;
  }
});
