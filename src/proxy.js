import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { SESSION_COOKIE, CTX_HEADERS } from "@/lib/authConstants";

// Runs before every /dashboard/* page and every /api/* route. (Next 16
// renamed `middleware` → `proxy`; same behaviour, now Node.js runtime by
// default, so `jsonwebtoken` works here.)
export const config = {
  matcher: ["/dashboard/:path*", "/print/:path*", "/api/:path*"],
};

// Routes reachable without a session.
const PUBLIC_API = new Set(["/api/auth/login"]);
// The public waiting-room display polls a read-only, no-PII, slug-scoped
// endpoint — deliberately unauthenticated (the display screen has no login).
const PUBLIC_API_PREFIXES = ["/api/display/"];

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

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
