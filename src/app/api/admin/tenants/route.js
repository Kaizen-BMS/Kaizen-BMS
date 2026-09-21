import { z } from "zod";
import crypto from "crypto";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { hashPassword } from "@/lib/auth";
import { TENANT_TYPES, SOLO_TYPE_MODULE, SOLO_TYPE_OWNER_ROLE } from "@/lib/tenants";
import { MODULE_NAMES } from "@/lib/modules";
import { MODULE_LABEL } from "@/lib/moduleInstances";
import { uniquePublicCode } from "@/lib/orgAdmin";

export const dynamic = "force-dynamic";

// SUPER_ADMIN only (no other role ever has this action — see rbac.js).
// Uses the raw `prisma` client throughout: these routes operate ACROSS
// tenants, there is no single tenant context to scope by (apiRoute() runs
// SUPER_ADMIN requests with tenantId null — tenantDb would throw).
export const GET = apiRoute("tenant:read", async () => {
  const rows = await prisma.tenants.findMany({
    orderBy: { created_at: "desc" },
    include: {
      tenant_modules: { where: { is_active: true }, select: { module_name: true } },
      _count: { select: { users: true } },
    },
  });
  const tenants = rows.map(({ tenant_modules, _count, ...rest }) => ({
    ...rest,
    activeModules: tenant_modules.map((m) => m.module_name),
    staffCount: _count.users,
  }));
  return json({ tenants });
});

function randomTempPassword() {
  // 5 groups of 4 base32-ish chars, human-typeable, e.g. "K7XQ-3MPZ-..."
  return crypto
    .randomBytes(10)
    .toString("hex")
    .toUpperCase()
    .match(/.{1,4}/g)
    .join("-");
}

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(191),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{2,64}$/, "lowercase letters, digits, hyphens only"),
    type: z.enum(TENANT_TYPES),
    modules: z.array(z.enum(MODULE_NAMES)).max(MODULE_NAMES.length).optional().default([]),
    ownerName: z.string().trim().min(1).max(191),
    ownerEmail: z.string().trim().email().max(191),
    // Optional: attach the new facility to an existing organization (one owner, several facilities).
    organizationId: z.coerce.number().int().positive().optional(),
    // Optional: the owner's own chosen password (otherwise one is generated and shown once).
    ownerPassword: z.string().min(8).max(200).optional().or(z.literal("")),
    // Solo packs may add Billing (a hospital just lists it in modules).
    withBilling: z.boolean().optional(),
  })
  .refine((b) => b.type !== "HOSPITAL" || b.modules.length > 0, {
    message: "select at least one module for a HOSPITAL tenant",
    path: ["modules"],
  });

// Provisions the tenant, its tenant_modules, and the initial owner account
// with a temp password — shown ONCE in this response, never stored in
// plaintext or retrievable again (only the bcrypt hash is kept).
export const POST = apiRoute("tenant:manage", async (request) => {
  const body = await parseBody(request, createSchema);

  const modules = body.type === "HOSPITAL" ? body.modules : [SOLO_TYPE_MODULE[body.type], ...(body.withBilling ? ["BILLING"] : [])];
  const ownerRole = body.type === "HOSPITAL" ? "HOSPITAL_ADMIN" : SOLO_TYPE_OWNER_ROLE[body.type];

  const existingSlug = await prisma.tenants.findUnique({ where: { slug: body.slug }, select: { id: true } });
  if (existingSlug) throw new HttpError(409, "slug_taken");

  const tempPassword = body.ownerPassword || randomTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  // Resolved before the transaction so the remote-DB round trips do not eat its timeout.
  let organizationId = null;
  if (body.organizationId) {
    const org = await prisma.organizations.findUnique({ where: { id: BigInt(body.organizationId) }, select: { id: true } });
    if (!org) throw new HttpError(404, "organization_not_found");
    organizationId = org.id;
  }
  const publicCode = await uniquePublicCode(prisma, body.type);

  const { tenant, owner } = await prisma.$transaction(async (tx) => {
    if (organizationId == null) organizationId = (await tx.organizations.create({ data: { name: body.name } })).id;
    const tenant = await tx.tenants.create({
      data: { name: body.name, slug: body.slug, type: body.type, active: true, organization_id: organizationId, public_code: publicCode },
    });
    for (const m of modules) {
      await tx.tenant_modules.create({
        data: { tenant_id: tenant.id, module_name: m, is_active: true },
      });
      // Phase 2 of the platform rebuild: every module a tenant is
      // provisioned with gets its default module_instances row up front,
      // so nothing downstream ever has to lazily discover a missing one.
      await tx.module_instances.create({
        data: { tenant_id: tenant.id, module_name: m, name: MODULE_LABEL[m] || m, status: "ACTIVE", is_default: true },
      });
    }
    const owner = await tx.users.create({
      data: {
        tenant_id: tenant.id,
        name: body.ownerName,
        email: body.ownerEmail,
        password_hash: passwordHash,
        role: ownerRole,
      },
    });
    // The initial owner login owns the organization this facility belongs to.
    await tx.organization_members.upsert({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: owner.id } },
      update: {},
      create: { organization_id: organizationId, user_id: owner.id, role: "OWNER" },
    });
    return { tenant, owner };
  });

  return json(
    {
      tenant: { ...tenant, activeModules: modules },
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, ...(body.ownerPassword ? { passwordSetByAdmin: true } : { tempPassword }) },
    },
    201,
  );
});
