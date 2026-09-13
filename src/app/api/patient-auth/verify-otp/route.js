import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prismaClient";
import { verifyOtpHash, signPatientSession } from "@/lib/patientAuth";
import {
  PATIENT_SESSION_COOKIE,
  PATIENT_SESSION_TTL_SECONDS,
  OTP_MAX_VERIFY_ATTEMPTS,
} from "@/lib/patientAuthConstants";

const bodySchema = z.object({
  tenantSlug: z.string().trim().min(1).max(191),
  phone: z.string().trim().min(3).max(32),
  code: z.string().trim().min(4).max(10),
});

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
    select: { id: true, otp_code_hash: true, otp_expires_at: true, otp_attempts: true },
  });
  const withOtp = patients.find((p) => p.otp_code_hash);

  if (!withOtp || !withOtp.otp_expires_at || withOtp.otp_expires_at < new Date()) {
    return NextResponse.json({ error: "invalid_or_expired_code" }, { status: 401 });
  }
  if (withOtp.otp_attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const ok = await verifyOtpHash(body.code, withOtp.otp_code_hash);
  if (!ok) {
    await prisma.patients.updateMany({
      where: { id: { in: patients.map((p) => p.id) } },
      data: { otp_attempts: { increment: 1 } },
    });
    return NextResponse.json({ error: "invalid_or_expired_code" }, { status: 401 });
  }

  // Single-use — clear OTP state on every matching row once verified.
  await prisma.patients.updateMany({
    where: { id: { in: patients.map((p) => p.id) } },
    data: { otp_code_hash: null, otp_expires_at: null, otp_requested_at: null, otp_attempts: 0 },
  });

  const token = signPatientSession({ tenantId: Number(tenant.id), phone: body.phone });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PATIENT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: PATIENT_SESSION_TTL_SECONDS,
  });
  return res;
}
