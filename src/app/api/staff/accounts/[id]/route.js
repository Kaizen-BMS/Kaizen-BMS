import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { clearAccessCache } from "@/lib/orgAccess";

export const dynamic = "force-dynamic";

const schema = z.object({ active: z.boolean() });

// Switch a person's login off (or back on). History stays; they simply can't
// sign in, and an open session stops working within seconds. You cannot switch
// off yourself or an owner.
export const PATCH = apiRoute("staff:manage", async (request, { session, params }) => {
  const { id } = await params;
  if (!/^[0-9]{1,18}$/.test(String(id))) throw new HttpError(404, "user_not_found");
  const { active } = await parseBody(request, schema);
  const user = await prisma.users.findUnique({ where: { id: BigInt(id) }, select: { id: true, tenant_id: true, role: true } });
  if (!user || user.role === "SUPER_ADMIN" || Number(user.tenant_id) !== Number(session.tenantId)) throw new HttpError(404, "user_not_found");
  if (Number(user.id) === Number(session.userId)) throw new HttpError(409, "cannot_disable_yourself");
  if (user.role.startsWith("OWNER_")) throw new HttpError(409, "cannot_disable_owner");
  await prisma.users.update({ where: { id: user.id }, data: { active } });
  clearAccessCache();
  return json({ ok: true, active });
});
