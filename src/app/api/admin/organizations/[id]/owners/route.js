import { z } from "zod";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { clearAccessCache } from "@/lib/orgAccess";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(191) });

// Make an existing user an OWNER of the organization (they can then switch
// between its facilities). The user must already exist.
export const POST = apiRoute("tenant:manage", async (request, { params }) => {
  const { id } = await params;
  const { email } = await parseBody(request, schema);
  const org = await prisma.organizations.findUnique({ where: { id: BigInt(id) } });
  if (!org) throw new HttpError(404, "organization_not_found");
  const user = await prisma.users.findFirst({ where: { email, tenant_id: { not: null } }, select: { id: true } });
  if (!user) throw new HttpError(404, "user_not_found");
  await prisma.organization_members.upsert({
    where: { organization_id_user_id: { organization_id: org.id, user_id: user.id } },
    update: {},
    create: { organization_id: org.id, user_id: user.id, role: "OWNER" },
  });
  clearAccessCache();
  return json({ ok: true }, 201);
});
