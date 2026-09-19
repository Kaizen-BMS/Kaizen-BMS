import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { ownsTenant, clearAccessCache } from "@/lib/orgAccess";

export const dynamic = "force-dynamic";

const schema = z.object({ enabled: z.boolean() });

// Owner-level activate / deactivate of one of their own facilities. Kaizen's
// own platform suspension (tenants.active) is separate and stays
// SUPER_ADMIN-only. The facility you are working in cannot be deactivated
// from itself — switch first.
export const PATCH = apiRoute(null, async (request, { session, params }) => {
  const { id } = await params;
  const tid = Number(id);
  if (!Number.isInteger(tid) || tid <= 0) throw new HttpError(404, "facility_not_found");
  if (session.tenantId == null || !(await ownsTenant(session.userId, tid))) throw new HttpError(404, "facility_not_found");
  const { enabled } = await parseBody(request, schema);
  if (!enabled && tid === session.tenantId) throw new HttpError(409, "cannot_disable_active_facility");
  const row = await prisma.tenants.update({ where: { id: BigInt(tid) }, data: { owner_enabled: enabled }, select: { id: true, owner_enabled: true } });
  clearAccessCache();
  return json({ facility: { id: Number(row.id), enabled: !!row.owner_enabled } });
});
