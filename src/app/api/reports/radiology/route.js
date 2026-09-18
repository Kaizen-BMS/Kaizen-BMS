import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { requireTenantId } from "@/lib/requestContext";
import { getRadiologyRevenue } from "@/lib/reports";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

// Radiology Revenue — the report gap this task's gap analysis flagged.
// Same action/module gate as every other report (reports:view, BILLING).
export const GET = apiRoute("reports:view", async (request) => {
  const { searchParams } = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(searchParams));
  try {
    const rows = await getRadiologyRevenue(BigInt(requireTenantId()), q);
    return json({ rows });
  } catch (err) {
    if (typeof err.status === "number") throw new HttpError(err.status, err.message);
    throw err;
  }
});
