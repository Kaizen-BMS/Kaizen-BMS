import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { MODULE_INSTANCE_STATUSES, setInstanceStatus } from "@/lib/moduleInstances";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(MODULE_INSTANCE_STATUSES),
});

// ACTIVE / SUSPENDED / ARCHIVED — never a physical delete (CLAUDE.md
// "Module suspension"/"Module removal" rules apply here the same as
// everywhere else in this codebase). The default instance can be
// suspended but never archived — see setInstanceStatus()'s comment.
export const PATCH = apiRoute("moduleinstance:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(request, patchSchema);
  const instance = await setInstanceStatus(tenantDb, {
    tenantId: ctx.session.tenantId,
    instanceId: id,
    status: body.status,
  });
  emitToTenant(ctx.session.tenantId, "module_instance:updated", { instance });
  return json({ instance });
});
