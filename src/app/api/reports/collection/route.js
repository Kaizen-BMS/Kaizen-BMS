import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { requireTenantId } from "@/lib/requestContext";
import { getCollectionReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  mode: z.enum(["CASH", "CARD", "UPI"]).optional(),
  doctorId: z.coerce.number().int().positive().optional(),
});

// REPORT 1 — Daily Collection (CLAUDE.md "Reports"). Tenant + RBAC + module
// gate all handled by apiRoute("reports:view", ...); every filter is
// validated before touching the DB.
export const GET = apiRoute("reports:view", async (request) => {
  const { searchParams } = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(searchParams));
  try {
    const report = await getCollectionReport(BigInt(requireTenantId()), q);
    return json(report);
  } catch (err) {
    if (typeof err.status === "number") throw new HttpError(err.status, err.message);
    throw err;
  }
});
