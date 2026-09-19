import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRoute, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { signSession } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/authConstants";
import { ownsTenant } from "@/lib/orgAccess";

export const dynamic = "force-dynamic";

const schema = z.object({ tenantId: z.coerce.number().int().positive() });

// Switch the ACTIVE facility. The target must be the user's own home
// facility or a facility of an organization they OWN — verified live against
// the database here, never from the request. Anything else is a 404 (a
// forged id is indistinguishable from a non-existent one).
export const POST = apiRoute(null, async (request, { session }) => {
  if (session.tenantId == null) throw new HttpError(403, "platform_sessions_cannot_switch");
  const { tenantId } = await parseBody(request, schema);

  const me = await prisma.users.findUnique({ where: { id: BigInt(session.userId) }, select: { tenant_id: true, role: true } });
  if (!me) throw new HttpError(401, "unauthorized");
  const home = me.tenant_id == null ? null : Number(me.tenant_id);

  const target = await prisma.tenants.findUnique({ where: { id: BigInt(tenantId) }, select: { id: true, active: true, owner_enabled: true } });
  const allowed = target && (tenantId === home || (await ownsTenant(session.userId, tenantId)));
  if (!allowed) throw new HttpError(404, "facility_not_found");
  if (!target.active || !target.owner_enabled) throw new HttpError(409, "facility_not_enabled");

  const role = tenantId === home ? me.role : "HOSPITAL_ADMIN";
  const token = signSession({ userId: session.userId, tenantId, role, homeTenantId: home });
  const res = NextResponse.json({ ok: true, activeTenantId: tenantId });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
});
