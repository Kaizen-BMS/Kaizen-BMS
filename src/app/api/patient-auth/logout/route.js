import { NextResponse } from "next/server";
import { PATIENT_SESSION_COOKIE } from "@/lib/patientAuthConstants";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PATIENT_SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
