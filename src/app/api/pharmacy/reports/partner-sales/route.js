import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { requireTenantId } from "@/lib/requestContext";
import { getPartnerSalesReport } from "@/lib/pharmacyReports";

export const dynamic = "force-dynamic";

export const GET = apiRoute("pharmacy:reports", async (request) => {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || undefined;

  try {
    return json(await getPartnerSalesReport(BigInt(requireTenantId()), { date }));
  } catch (err) {
    if (typeof err.status === "number") throw new HttpError(err.status, err.message);
    throw err;
  }
});
