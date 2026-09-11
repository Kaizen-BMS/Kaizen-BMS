import { z } from "zod";
import crypto from "crypto";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { hashPassword } from "@/lib/auth";
import { TENANT_TYPES, SOLO_TYPE_MODULE, SOLO_TYPE_OWNER_ROLE } from "@/lib/tenants";
import { MODULE_NAMES } from "@/lib/modules";

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

  const modules = body.type === "HOSPITAL" ? body.modules : [SOLO_TYPE_MODULE[body.type]];
  const ownerRole = body.type === "HOSPITAL" ? "HOSPITAL_ADMIN" : SOLO_TYPE_OWNER_ROLE[body.type];

  const existingSlug = await prisma.tenants.findUnique({ where: { slug: body.slug }, select: { id: true } });
  if (existingSlug) throw new HttpError(409, "slug_taken");

  const tempPassword = randomTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const { tenant, owner } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenants.create({
      data: { name: body.name, slug: body.slug, type: body.type, active: true },
    });
    for (const m of modules) {
      await tx.tenant_modules.create({
        data: { tenant_id: tenant.id, module_name: m, is_active: true },
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
    return { tenant, owner };
  });

  return json(
    {
      tenant: { ...tenant, activeModules: modules },
      owner: { id: owner.id, name: owner.name, email: owner.email, role: owner.role, tempPassword },
    },
    201,
  );
});
