import { apiRoute, json } from "@/lib/apiRoute";
import { prisma } from "@/lib/prismaClient";
import { requireTenantId } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

// The doctor picker for the multi-doctor calendar toggle and the booking
// popover — every DOCTOR in this tenant, regardless of whether they've set
// up any availability yet. `users` is excluded from tenantDb's auto-scoping
// (tenant_id is nullable there, for SUPER_ADMIN) so this filters explicitly,
// same as every other cross-cutting `users` lookup in this project.
export const GET = apiRoute("appointment:read", async () => {
  const tid = requireTenantId();
  const doctors = await prisma.users.findMany({
    where: { tenant_id: BigInt(tid), role: { in: ["DOCTOR", "OWNER_DOCTOR"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return json({ doctors });
});
