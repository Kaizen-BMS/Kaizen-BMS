import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { clearAccessCache } from "@/lib/orgAccess";
import { FEATURES, parseDeny } from "@/lib/featureAccess";

export const dynamic = "force-dynamic";

async function load(session, id) {
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "user_not_found");
  const user = await prisma.users.findUnique({ where: { id: BigInt(id) }, select: { id: true, name: true, role: true, tenant_id: true, access_deny: true } });
  if (!user || Number(user.tenant_id) !== Number(session.tenantId) || user.role === "SUPER_ADMIN") throw new HttpError(404, "user_not_found");
  return user;
}

// Which parts of the system this person may use. Only features the facility
// really has are listed; everything is allowed unless switched off.
export const GET = apiRoute("staff:manage", async (request, { session, params }) => {
  const { id } = await params;
  const user = await load(session, id);
  const mods = new Set((await prisma.tenant_modules.findMany({ where: { tenant_id: BigInt(session.tenantId), is_active: true }, select: { module_name: true } })).map((m) => m.module_name));
  const features = Object.entries(FEATURES)
    .filter(([, f]) => f.module == null || mods.has(f.module))
    .map(([key, f]) => ({ key, label: f.label }));
  const locked = user.role === "HOSPITAL_ADMIN" || user.role.startsWith("OWNER_");
  return json({ name: user.name, role: user.role, locked, features, deny: parseDeny(user.access_deny) });
});

const schema = z.object({ deny: z.array(z.string()).max(20) });

export const PATCH = apiRoute("staff:manage", async (request, { session, params }) => {
  const { id } = await params;
  const user = await load(session, id);
  if (user.role === "HOSPITAL_ADMIN" || user.role.startsWith("OWNER_")) throw new HttpError(409, "cannot_limit_admin_or_owner");
  const { deny } = await parseBody(request, schema);
  const clean = [...new Set(deny.filter((d) => FEATURES[d]))];
  await prisma.users.update({ where: { id: user.id }, data: { access_deny: clean.length ? JSON.stringify(clean) : null } });
  clearAccessCache();
  return json({ ok: true, deny: clean });
});
