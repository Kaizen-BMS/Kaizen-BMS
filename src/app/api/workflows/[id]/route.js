import { apiRoute, json } from "@/lib/apiRoute";
import { tenantDb } from "@/lib/prismaClient";
import { getInstance } from "@/lib/workflows/engine";

export const dynamic = "force-dynamic";

export const GET = apiRoute("workflow:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const workflow = await getInstance(tenantDb, ctx.session.tenantId, id);
  if (!workflow) return json({ error: "not_found" }, 404);
  return json({ workflow });
});
