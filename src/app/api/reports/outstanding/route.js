import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { requireTenantId } from "@/lib/requestContext";
import { getOutstandingReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
});

// REPORT 2 — Outstanding / Due.
export const GET = apiRoute("reports:view", async (request) => {
  const { searchParams } = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(searchParams));
  const report = await getOutstandingReport(BigInt(requireTenantId()), q);
  return json(report);
});
