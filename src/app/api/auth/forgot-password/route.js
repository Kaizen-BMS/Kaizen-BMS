import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prismaClient";
import { issueResetToken } from "@/lib/passwordReset";
import { sendPasswordResetEmail } from "@/lib/mailer";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(191) });
const hits = new Map();

// Always answers the same way — whether or not the email exists or the mail
// could be sent — so it cannot be used to discover accounts.
export async function POST(request) {
  const generic = NextResponse.json({ ok: true });
  let email;
  try {
    ({ email } = schema.parse(await request.json()));
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const now = Date.now();
  const recent = (hits.get(email) || []).filter((t) => now - t < 15 * 60_000);
  if (recent.length >= 3) return generic;
  hits.set(email, [...recent, now]);

  try {
    const user = await prisma.users.findFirst({ where: { email }, select: { id: true } });
    if (user) {
      const token = await issueResetToken(user.id);
      const base = process.env.APP_URL || new URL(request.url).origin;
      await sendPasswordResetEmail(email, `${base}/reset-password?token=${token}`);
    }
  } catch (err) {
    console.error("forgot-password: could not send reset email:", err.message);
  }
  return generic;
}
