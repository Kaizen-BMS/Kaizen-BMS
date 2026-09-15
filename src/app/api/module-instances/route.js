import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { tenantDb } from "@/lib/prismaClient";
import { MODULE_NAMES } from "@/lib/modules";
import { listInstances, createInstance } from "@/lib/moduleInstances";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// Phase 2 of the platform rebuild (CLAUDE.md "Platform rebuild") — basic
// admin foundation for module instances. HOSPITAL_ADMIN only (the "*"
// wildcard is the only thing that satisfies moduleinstance:manage/read —
// see rbac.js), same tenantTypes:["HOSPITAL"] boundary as Staff
// Management: a solo tenant has exactly one instance of its one module by
// definition, nothing here for it to manage.

export const GET = apiRoute("moduleinstance:read", async (request, { session }) => {
  const moduleName = new URL(request.url).searchParams.get("module");
  if (!moduleName || !MODULE_NAMES.includes(moduleName)) {
    return json({ error: "invalid_module" }, 400);
  }
  const instances = await listInstances(tenantDb, session.tenantId, moduleName);
  return json({ instances });
});

const createSchema = z.object({
  moduleName: z.enum(MODULE_NAMES),
  name: z.string().trim().min(1).max(191),
});

export const POST = apiRoute("moduleinstance:manage", async (request, { session }) => {
  const body = await parseBody(request, createSchema);
  const instance = await createInstance(tenantDb, {
    tenantId: session.tenantId,
    moduleName: body.moduleName,
    name: body.name,
    createdBy: session.userId,
  });
  emitToTenant(session.tenantId, "module_instance:created", { instance });
  return json({ instance }, 201);
});
