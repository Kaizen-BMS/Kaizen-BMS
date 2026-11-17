import { z } from "zod";
import crypto from "crypto";
import { apiRoute, json, HttpError } from "@/lib/apiRoute";
import { parseBody } from "@/lib/validate";
import { prisma } from "@/lib/prismaClient";
import { hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

// SUPER_ADMIN only — deliberately NOT blogpost:manage. A CONTENT_EDITOR
// must never be able to create another CONTENT_EDITOR (or any other
// login): that would let the one narrow responsibility the owner assigned
// quietly grant itself more reach. See rbac.js's SCOPE_RESTRICTED_ACTIONS
// (blogeditor:manage → SUPER_ADMIN only).

export const GET = apiRoute("blogeditor:manage", async () => {
  const editors = await prisma.users.findMany({
    where: { role: "CONTENT_EDITOR" },
    select: { id: true, name: true, email: true, active: true, created_at: true },
    orderBy: { created_at: "desc" },
  });
  return json({ editors });
});

function randomTempPassword() {
  return crypto.randomBytes(10).toString("hex").toUpperCase().match(/.{1,4}/g).join("-");
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(191),
  email: z.string().trim().toLowerCase().email().max(191),
  // Optional — same pattern as Create Tenant's `ownerPassword`: the admin
  // can set the editor's password directly, or leave it blank and one is
  // generated and shown once instead.
  password: z.string().min(8).max(200).optional().or(z.literal("")),
});

// Provisions a CONTENT_EDITOR login — tenant_id NULL, same platform-level
// shape as SUPER_ADMIN, but with only the blog permissions (rbac.js's
// BLOG_EDITOR list, no "*"). A generated temp password is returned ONCE, in
// this response only — never logged, never retrievable again — same
// pattern as Create Tenant's owner account; an admin-chosen password is
// never echoed back at all.
export const POST = apiRoute("blogeditor:manage", async (request) => {
  const body = await parseBody(request, createSchema);

  const existing = await prisma.users.findFirst({ where: { tenant_id: null, email: body.email }, select: { id: true } });
  if (existing) throw new HttpError(409, "email_taken");

  const tempPassword = body.password || randomTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const editor = await prisma.users.create({
    data: {
      tenant_id: null,
      name: body.name,
      email: body.email,
      password_hash: passwordHash,
      role: "CONTENT_EDITOR",
    },
  });

  return json(
    {
      editor: {
        id: editor.id,
        name: editor.name,
        email: editor.email,
        ...(body.password ? { passwordSetByAdmin: true } : { tempPassword }),
      },
    },
    201,
  );
});
