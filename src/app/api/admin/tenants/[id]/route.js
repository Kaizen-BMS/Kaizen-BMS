import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { emitToTenant } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export const GET = apiRoute("tenant:read", async (_request, ctx) => {
  const { id } = await ctx.params;
  const tenant = await prisma.tenants.findUnique({
    where: { id: BigInt(id) },
    include: {
      tenant_modules: { select: { module_name: true, is_active: true } },
      users: { select: { id: true, name: true, email: true, role: true, created_at: true }, orderBy: { id: "asc" } },
    },
  });
  if (!tenant) return json({ error: "not_found" }, 404);
  const { tenant_modules, users, ...rest } = tenant;
  return json({ tenant: { ...rest, modules: tenant_modules, staff: users } });
});

const patchSchema = z.object({ active: z.boolean() });

// Suspend/reactivate — suspends ALL logins for this tenant, keeps data
// (never a delete). Session cookies stay valid until they'd naturally
// expire, but apiRoute() re-checks `tenant.active` on every request, so a
// suspended tenant's staff are rejected on their very next call.
export const PATCH = apiRoute("tenant:manage", async (request, ctx) => {
  const { id } = await ctx.params;
  const body = await parseBody(request, patchSchema);

  const existing = await prisma.tenants.findUnique({ where: { id: BigInt(id) }, select: { id: true } });
  if (!existing) return json({ error: "not_found" }, 404);

  const tenant = await prisma.tenants.update({ where: { id: BigInt(id) }, data: { active: body.active } });
  emitToTenant(Number(id), "tenant:updated", { tenant });
  return json({ tenant });
});
