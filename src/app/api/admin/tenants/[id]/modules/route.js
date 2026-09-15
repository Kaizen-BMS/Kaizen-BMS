import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { MODULE_NAMES } from "@/lib/modules";
import { syncDefaultInstance } from "@/lib/moduleInstances";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  moduleName: z.enum(MODULE_NAMES),
  isActive: z.boolean(),
});

// Rent / un-rent a module for a tenant — the only way a module becomes
// available to a tenant's staff (module gating in modules.js checks this
// table on every gated route/socket-room join).
export const PATCH = apiRoute("tenant:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const tenantId = BigInt(id);
  const tenant = await prisma.tenants.findUnique({ where: { id: tenantId }, select: { id: true, type: true } });
  if (!tenant) return json({ error: "not_found" }, 404);

  const body = await parseBody(request, patchSchema);

  const existing = await prisma.tenant_modules.findFirst({
    where: { tenant_id: tenantId, module_name: body.moduleName },
  });
  if (existing) {
    await prisma.tenant_modules.update({ where: { id: existing.id }, data: { is_active: body.isActive } });
  } else {
    await prisma.tenant_modules.create({
      data: { tenant_id: tenantId, module_name: body.moduleName, is_active: body.isActive },
    });
  }

  // Keeps the module's default instance in sync — Phase 2 of the platform
  // rebuild — so activating a module for the first time (or re-activating
  // one) always leaves a working default instance behind, with no manual
  // step, and existing single-instance tenants see no behavior change.
  await syncDefaultInstance(prisma, tenantId, body.moduleName, body.isActive);

  const modules = await prisma.tenant_modules.findMany({
    where: { tenant_id: tenantId },
    select: { module_name: true, is_active: true },
  });
  emitToTenant(Number(id), "tenant:modules_updated", { tenantId: Number(id), modules });
  return json({ modules });
});
