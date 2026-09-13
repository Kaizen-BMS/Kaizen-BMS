import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prismaClient";
import { generateOtp, hashOtp } from "@/lib/patientAuth";
import { OTP_TTL_SECONDS, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/patientAuthConstants";

const bodySchema = z.object({
  tenantSlug: z.string().trim().min(1).max(191),
  phone: z.string().trim().min(3).max(32),
});

// Generates and "sends" a one-time code for every patient record at this
// tenant matching this phone number (there can legitimately be more than
// one — family members, duplicate registrations; they all share one code
// since the phone is what's being verified, not a specific patient row).
// No SMS provider is chosen yet — stubbed as a console-logged code rather
// than blocking this whole feature on a vendor decision (Razorpay-style
// business calls don't belong in this pass either — see CLAUDE.md).
export async function POST(request) {
  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const tenant = await prisma.tenants.findFirst({
    where: { slug: body.tenantSlug, active: true },
    select: { id: true },
  });
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const patients = await prisma.patients.findMany({
    where: { tenant_id: tenant.id, phone: body.phone },
    select: { id: true, otp_requested_at: true },
  });

  if (patients.length > 0) {
    const lastRequested = patients
      .map((p) => p.otp_requested_at)
      .filter(Boolean)
      .sort((a, b) => b - a)[0];
    if (lastRequested && Date.now() - lastRequested.getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      const retryAfter = Math.ceil(
        (OTP_RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - lastRequested.getTime())) / 1000,
      );
      return NextResponse.json({ error: "too_soon", retryAfter }, { status: 429 });
    }

    const code = generateOtp();
    const hash = await hashOtp(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

    await prisma.patients.updateMany({
      where: { id: { in: patients.map((p) => p.id) } },
      data: { otp_code_hash: hash, otp_expires_at: expiresAt, otp_requested_at: now, otp_attempts: 0 },
    });

    console.log(`[patient-otp] tenant=${body.tenantSlug} phone=${body.phone} code=${code} (expires in ${OTP_TTL_SECONDS}s)`);
  }

  // Identical response whether or not the phone matched a registered
  // patient — never reveal who's registered, same principle as staff login.
  return NextResponse.json({ message: "If this number is registered, a code has been sent." });
}
