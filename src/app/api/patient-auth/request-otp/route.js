import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prismaClient";
import { generateOtp, hashOtp } from "@/lib/patientAuth";
import { sendOtpEmail } from "@/lib/mailer";
import { checkOtpCooldown, markOtpRequested } from "@/lib/otpThrottle";
import { OTP_TTL_SECONDS } from "@/lib/patientAuthConstants";

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
//
// This response is byte-for-byte identical for EVERY outcome except
// invalid input and an unknown tenant slug (neither of those is secret):
// unregistered phone, registered with no email anywhere, registered with
// an email and the send succeeds, and registered with an email but the
// send genuinely fails. A distinct response for any of those — including
// an earlier version of this route that returned a different error for
// "no email on file" and another that let a naturally-failing send return
// a different status — is an enumeration oracle: it lets a caller learn
// "this phone has an account" (or "has an account with an email") purely
// from which shape of response comes back, with no other information
// needed. Delivery failure is deliberately invisible to the caller here,
// the same way a mature "forgot password" flow never distinguishes
// "email doesn't exist" from "email exists but sending failed" — a send
// failure is logged server-side for ops to notice and fix, never surfaced
// differently to whoever asked.
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

  // Cooldown is checked and marked BEFORE any patient/email lookup, keyed
  // only by (tenant, phone) — see otpThrottle.js's comment for why this
  // must be unconditional: if it only got marked when a patient/email
  // actually existed, the cooldown itself would become a second-request
  // enumeration oracle, just delayed by one round trip.
  const cooldownKey = `${tenant.id}:${body.phone}`;
  const cooldown = checkOtpCooldown(cooldownKey);
  if (!cooldown.allowed) {
    return NextResponse.json({ error: "too_soon", retryAfter: cooldown.retryAfter }, { status: 429 });
  }
  markOtpRequested(cooldownKey);

  const patients = await prisma.patients.findMany({
    where: { tenant_id: tenant.id, phone: body.phone },
    select: { id: true, email: true },
    orderBy: { id: "asc" },
  });
  const withEmail = patients.filter((p) => p.email);

  if (withEmail.length > 0) {
    const code = generateOtp();
    try {
      await sendOtpEmail(withEmail[0].email, code);

      const hash = await hashOtp(code);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
      await prisma.patients.updateMany({
        where: { id: { in: patients.map((p) => p.id) } },
        data: { otp_code_hash: hash, otp_expires_at: expiresAt, otp_requested_at: now, otp_attempts: 0 },
      });
    } catch (err) {
      // Never returned to the caller, never logs the credentials (they're
      // never read into a variable here in the first place) — only
      // enough for ops to find and fix the real problem.
      console.error(
        `[patient-otp] SMTP send failed for tenant=${tenant.id} phone=${body.phone} (${patients.length} matching patient(s)):`,
        err.message,
      );
    }
  }

  return NextResponse.json({ message: "If this number is registered, a code has been sent." });
}
