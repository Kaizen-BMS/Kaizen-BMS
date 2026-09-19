import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { clearAccessCache } from "@/lib/orgAccess";

export const dynamic = "force-dynamic";

const schema = z.object({ tenantId: z.coerce.number().int().positive() });

// Attach an existing facility (tenant) to an organization.
export const POST = apiRoute("tenant:manage", async (request, { params }) => {
  const { id } = await params;
  const { tenantId } = await parseBody(request, schema);
  const org = await prisma.organizations.findUnique({ where: { id: BigInt(id) } });
  if (!org) throw new HttpError(404, "organization_not_found");
  const t = await prisma.tenants.findUnique({ where: { id: BigInt(tenantId) }, select: { id: true } });
  if (!t) throw new HttpError(404, "tenant_not_found");
  await prisma.tenants.update({ where: { id: t.id }, data: { organization_id: org.id } });
  clearAccessCache();
  return json({ ok: true });
});
