import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/apiRoute";
import { queryOne } from "@/lib/db";
import { getActiveModules } from "@/lib/modules";

export const dynamic = "force-dynamic";

// Any logged-in role. Returns the current user + the hospital's active
// modules so the client can render the right nav. SUPER_ADMIN has no
// hospital, so the tenant repo can't be used here — query by id directly.
export const GET = apiRoute(null, async (_request, { session }) => {
  const user = await queryOne(
    "SELECT id, name, email, role, tenant_id FROM users WHERE id = ? LIMIT 1",
    [session.userId],
  );
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const modules = await getActiveModules(session.tenantId);
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
    },
    modules,
  });
});
