import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { retryStep, runAdvancer, getInstance } from "@/lib/workflows/engine";

export const dynamic = "force-dynamic";

// Administrative action — HOSPITAL_ADMIN/SUPER_ADMIN only (wildcard-only,
// same as moduleinstance:manage/moduleconnection:manage). Resets the
// current FAILED/WAITING step back to PENDING (bounded by
// MAX_STEP_ATTEMPTS) and immediately re-runs that workflow's own
// advance() so the retry takes effect right away rather than waiting for
// the next unrelated trigger.
export const POST = apiRoute("workflow:manage", async (_request, ctx) => {
  const { id } = await ctx.params;
  const result = await retryStep(tenantDb, ctx.session.tenantId, id);
  if (!result) return json({ error: "not_found" }, 404);

  await runAdvancer(result.definitionCode, ctx.session.tenantId, result.referenceId);

  const workflow = await getInstance(tenantDb, ctx.session.tenantId, id);
  if (!workflow) throw new HttpError(404, "not_found");
  return json({ workflow });
});
