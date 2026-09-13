import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { SESSION_COOKIE, CTX_HEADERS } from "@/lib/authConstants";
import { verifyPatientSession } from "@/lib/patientAuth";
import { PATIENT_SESSION_COOKIE } from "@/lib/patientAuthConstants";

// Runs before every /dashboard/* page and every /api/* route. (Next 16
// renamed `middleware` → `proxy`; same behaviour, now Node.js runtime by
// default, so `jsonwebtoken` works here.)
export const config = {
  matcher: ["/dashboard/:path*", "/print/:path*", "/api/:path*", "/patient/:path*"],
};

// Routes reachable without a session.
const PUBLIC_API = new Set(["/api/auth/login"]);
// The public waiting-room display polls a read-only, no-PII, slug-scoped
// endpoint — deliberately unauthenticated (the display screen has no login).
// /api/patient-auth/* is the patient-portal equivalent of /api/auth/login —
// there is no patient session yet, that's how one gets created.
const PUBLIC_API_PREFIXES = ["/api/display/", "/api/patient-auth/"];

// Patient Portal routes use a GENUINELY SEPARATE session (see
// src/lib/patientAuth.js) — never the staff cookie/verify path above, and
// never checked against staff RBAC. `/patient/<tenantSlug>/login` itself
// must stay reachable without a session (that's where one is created).
function isPatientRoute(pathname) {
  return pathname.startsWith("/patient/") || pathname.startsWith("/api/patient/");
}
function isPatientLoginPage(pathname) {
  return /^\/patient\/[^/]+\/login\/?$/.test(pathname);
}

async function handlePatientRoute(request, pathname, isApi) {
  if (!isApi && isPatientLoginPage(pathname)) return NextResponse.next();

  const token = request.cookies.get(PATIENT_SESSION_COOKIE)?.value;
  const session = token ? await verifyPatientSession(token) : null;

  if (!session) {
    if (isApi) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const slug = pathname.split("/")[2] || "";
    const url = request.nextUrl.clone();
    url.pathname = `/patient/${slug}/login`;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isPatientRoute(pathname)) {
    return handlePatientRoute(request, pathname, isApi);
  }

  if (
    isApi &&
    (PUBLIC_API.has(pathname) || PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p)))
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Strip any client-supplied context headers, then set them from the
  // *verified* token so downstream handlers can trust them.
  const headers = new Headers(request.headers);
  for (const h of Object.values(CTX_HEADERS)) headers.delete(h);
  headers.set(CTX_HEADERS.userId, String(session.userId));
  headers.set(CTX_HEADERS.tenantId, String(session.tenantId));
  headers.set(CTX_HEADERS.role, session.role);

  return NextResponse.next({ request: { headers } });
}
