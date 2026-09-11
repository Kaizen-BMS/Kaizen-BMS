import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prismaClient";
import { verifyPassword, signSession } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/authConstants";
import { loginRateCheck, loginRateHit, loginRateReset } from "@/lib/rateLimit";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(191),
  password: z.string().min(1).max(200),
  // Optional — only needed if the same email exists at more than one hospital.
  tenantSlug: z.string().trim().max(191).optional(),
});

export async function POST(request) {
  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { email, password, tenantSlug } = body;

  // Brute-force protection: 5 attempts / 15 min per email.
  const rate = loginRateCheck(email);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "too_many_attempts", retryAfter: rate.retryAfter },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  // Cross-tenant lookup — the ONE deliberate query without a tenant context,
  // because at login we don't yet know the hospital. Raw `prisma`, not
  // `tenantDb` — there is no tenant context to scope this by yet.
  const user = tenantSlug
    ? await prisma.users.findFirst({
        where: { email, tenants: { slug: tenantSlug } },
        select: { id: true, tenant_id: true, name: true, email: true, password_hash: true, role: true },
      })
    : await prisma.users.findFirst({
        where: { email },
        select: { id: true, tenant_id: true, name: true, email: true, password_hash: true, role: true },
      });

  const ok = await verifyPassword(password, user?.password_hash);

  if (!user || !ok) {
    loginRateHit(email);
    // Generic message — don't reveal whether the email exists.
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // A suspended tenant blocks every login immediately — apiRoute()/
  // guardPage() also re-check this on every later request, but the login
  // response itself should say so rather than hand out a cookie that's
  // rejected on the very next call.
  if (user.tenant_id != null) {
    const tenant = await prisma.tenants.findUnique({
      where: { id: user.tenant_id },
      select: { active: true },
    });
    if (!tenant || !tenant.active) {
      return NextResponse.json({ error: "tenant_suspended" }, { status: 403 });
    }
  }

  loginRateReset(email);

  const userId = Number(user.id);
  const tenantId = user.tenant_id == null ? null : Number(user.tenant_id);

  const token = signSession({ userId, tenantId, role: user.role });

  const res = NextResponse.json({
    user: {
      id: userId,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId,
    },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
