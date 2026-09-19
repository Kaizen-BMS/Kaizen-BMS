import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeResetToken } from "@/lib/passwordReset";

const schema = z.object({ token: z.string().min(20).max(200), password: z.string().min(8).max(200) });

export async function POST(request) {
  let body;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const ok = await consumeResetToken(body.token, body.password);
  if (!ok) return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
