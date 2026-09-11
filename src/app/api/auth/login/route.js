import { NextResponse } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db";
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
  // because at login we don't yet know the hospital. Still fully parameterized.
  const user = tenantSlug
    ? await queryOne(
        `SELECT u.id, u.tenant_id, u.name, u.email, u.password_hash, u.role
           FROM users u JOIN tenants h ON h.id = u.tenant_id
          WHERE u.email = ? AND h.slug = ? LIMIT 1`,
        [email, tenantSlug],
      )
    : await queryOne(
        `SELECT id, tenant_id, name, email, password_hash, role
           FROM users WHERE email = ? LIMIT 1`,
        [email],
      );

  const ok = await verifyPassword(password, user?.password_hash);

  if (!user || !ok) {
    loginRateHit(email);
    // Generic message — don't reveal whether the email exists.
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  loginRateReset(email);

  const token = signSession({
    userId: user.id,
    tenantId: user.tenant_id,
    role: user.role,
  });

  const res = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
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
