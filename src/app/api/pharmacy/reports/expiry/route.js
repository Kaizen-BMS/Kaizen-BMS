import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { requireTenantId } from "@/lib/requestContext";
import { getExpiryReport } from "@/lib/pharmacyReports";

export const dynamic = "force-dynamic";

export const GET = apiRoute("pharmacy:reports", async (request) => {
  const { searchParams } = new URL(request.url);
  const moduleInstanceId = searchParams.get("moduleInstanceId") || undefined;
  const days = searchParams.get("days") ? Number(searchParams.get("days")) : undefined;
  try {
    return json({ rows: await getExpiryReport(BigInt(requireTenantId()), { moduleInstanceId, days }) });
  } catch (err) {
    if (typeof err.status === "number") throw new HttpError(err.status, err.message);
    throw err;
  }
});
