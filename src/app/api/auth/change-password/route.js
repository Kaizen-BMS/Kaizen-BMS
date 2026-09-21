import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prismaClient";
import { hashPassword, verifyPassword } from "@/lib/auth";

const schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(8).max(200) });

// Any signed-in person changes THEIR OWN password (current one required).
export async function POST(request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const user = await prisma.users.findUnique({ where: { id: BigInt(session.userId) }, select: { id: true, password_hash: true } });
  if (!user || !(await verifyPassword(body.currentPassword, user.password_hash))) {
    return NextResponse.json({ error: "wrong_current_password" }, { status: 400 });
  }
  await prisma.users.update({ where: { id: user.id }, data: { password_hash: await hashPassword(body.newPassword) } });
  return NextResponse.json({ ok: true });
}
