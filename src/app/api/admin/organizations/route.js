import { z } from "zod";
import { apiRoute, json } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";

export const GET = apiRoute("tenant:read", async () => {
  const orgs = await prisma.organizations.findMany({ orderBy: { id: "asc" } });
  const [tenants, members, users] = await Promise.all([
    prisma.tenants.findMany({ where: { organization_id: { not: null } }, select: { id: true, name: true, type: true, organization_id: true, public_code: true } }),
    prisma.organization_members.findMany({ select: { organization_id: true, user_id: true } }),
    prisma.users.findMany({ where: { id: { in: (await prisma.organization_members.findMany({ select: { user_id: true } })).map((m) => m.user_id) } }, select: { id: true, name: true, email: true } }),
  ]);
  const uname = new Map(users.map((u) => [String(u.id), u]));
  return json({
    organizations: orgs.map((o) => ({
      id: Number(o.id),
      name: o.name,
      active: !!o.active,
      facilities: tenants.filter((t) => t.organization_id === o.id).map((t) => ({ id: Number(t.id), name: t.name, type: t.type, publicCode: t.public_code })),
      owners: members.filter((m) => m.organization_id === o.id).map((m) => ({ name: uname.get(String(m.user_id))?.name, email: uname.get(String(m.user_id))?.email })),
    })),
  });
});

const schema = z.object({ name: z.string().trim().min(1).max(191) });

export const POST = apiRoute("tenant:manage", async (request) => {
  const { name } = await parseBody(request, schema);
  const org = await prisma.organizations.create({ data: { name } });
  return json({ organization: { id: Number(org.id), name: org.name } }, 201);
});
