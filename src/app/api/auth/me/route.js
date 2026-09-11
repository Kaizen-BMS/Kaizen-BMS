import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/apiRoute";
import { prisma } from "@/lib/prismaClient";
import { getActiveModules } from "@/lib/modules";

export const dynamic = "force-dynamic";

// Any logged-in role. Returns the current user + the hospital's active
// modules so the client can render the right nav. Always looks up the
// caller's OWN verified id — `users` isn't tenant-scoped (SUPER_ADMIN has
// none), so this uses the raw client, not `tenantDb`.
export const GET = apiRoute(null, async (_request, { session }) => {
  const user = await prisma.users.findUnique({
    where: { id: BigInt(session.userId) },
    select: { id: true, name: true, email: true, role: true, tenant_id: true },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const modules = await getActiveModules(session.tenantId);
  return NextResponse.json({
    user: {
      id: Number(user.id),
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id == null ? null : Number(user.tenant_id),
    },
    modules,
  });
});
