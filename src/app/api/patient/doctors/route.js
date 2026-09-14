import { patientApiRoute, json } from "@/lib/patientApiRoute";
import { prisma } from "@/lib/prismaClient";
import { isModuleActive } from "@/lib/modules";

export const dynamic = "force-dynamic";

// `users` is excluded from tenantDb's auto-scoping (tenant_id nullable
// there, for SUPER_ADMIN), so this filters explicitly — same as the staff
// doctor-picker route.
export const GET = patientApiRoute(async (_request, { session }) => {
  const active = await isModuleActive(session.tenantId, "APPOINTMENTS");
  if (!active) return json({ moduleActive: false, doctors: [] });

  const doctors = await prisma.users.findMany({
    where: { tenant_id: BigInt(session.tenantId), role: "DOCTOR" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return json({ moduleActive: true, doctors });
});
