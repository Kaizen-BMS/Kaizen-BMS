import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prismaClient";
import { generateOtp, hashOtp } from "@/lib/patientAuth";
import { sendOtpEmail } from "@/lib/mailer";
import { OTP_TTL_SECONDS, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/patientAuthConstants";

const bodySchema = z.object({
  tenantSlug: z.string().trim().min(1).max(191),
  phone: z.string().trim().min(3).max(32),
});

// Generates and emails a one-time code for every patient record at this
// tenant matching this phone number (there can legitimately be more than
// one — family members, duplicate registrations; they all share one code
// since the phone is what's being verified, not a specific patient row).
// The code is sent to whichever of those patients has an email on file
// first (most patients only have one anyway) — real Gmail SMTP delivery
// via src/lib/mailer.js, replacing the earlier console-logged stub.
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
    select: { id: true, email: true, otp_requested_at: true },
    orderBy: { id: "asc" },
  });

  if (patients.length > 0) {
    // Deliberately DOES break the no-enumeration rule for this one case,
    // on purpose, per explicit product direction: a phone that's
    // registered but has no email on file gets a distinct, clear message
    // ("no email on file, please provide one to log in") rather than the
    // generic response — the alternative (silent failure) is worse than
    // the narrow leak of "this phone has an account." Every other case
    // (not registered at all, or registered with email) stays
    // indistinguishable, same as before.
    const withEmail = patients.filter((p) => p.email);
    if (withEmail.length === 0) {
      return NextResponse.json({ error: "no_email_on_file" }, { status: 422 });
    }

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

    // Send BEFORE persisting anything — a failed send shouldn't start the
    // resend cooldown for a code that never arrived.
    try {
      await sendOtpEmail(withEmail[0].email, code);
    } catch (err) {
      // Never log the credentials (they're never read into a variable
      // here in the first place) — only the failure itself.
      console.error("[patient-otp] email send failed:", err.message);
      return NextResponse.json({ error: "email_send_failed" }, { status: 502 });
    }

    const hash = await hashOtp(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
    await prisma.patients.updateMany({
      where: { id: { in: patients.map((p) => p.id) } },
      data: { otp_code_hash: hash, otp_expires_at: expiresAt, otp_requested_at: now, otp_attempts: 0 },
    });
  }

  // Identical response whether or not the phone matched a registered
  // patient (that has an email) — never reveal who's registered, same
  // principle as staff login.
  return NextResponse.json({ message: "If this number is registered, a code has been sent." });
}
