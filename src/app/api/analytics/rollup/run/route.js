import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { rollupAllTenants } from "@/lib/analytics/rollup";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").optional(),
});

// Manual rollup trigger — for verifying the scheduler's own job on demand
// rather than waiting for the next 5-minute tick. SUPER_ADMIN only
// (analytics:platform — see rbac.js), since it recomputes every tenant's
// rollup, not just the caller's own.
export const POST = apiRoute("analytics:platform", async (request) => {
  const body = await parseBody(request, bodySchema);
  const date = body.date || new Date().toISOString().slice(0, 10);
  try {
    const result = await rollupAllTenants(date);
    return json({ date, ...result });
  } catch (err) {
    throw new HttpError(500, "rollup_failed");
  }
});
