import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prismaClient";
import { getActiveModules } from "@/lib/modules";
import { getTenant } from "@/lib/tenants";
import { groupedNav } from "@/lib/navRegistry";
import { can } from "@/lib/rbac";
import DashboardShell from "./DashboardShell";

export const dynamic = "force-dynamic";

// proxy.js blocks unauthenticated requests; this re-check is defense in
// depth and assembles everything the shell needs. The sidebar is derived
// from the nav registry here — never hand-built per module.
export default async function DashboardLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.users.findFirst({
    where: {
      id: BigInt(session.userId),
      tenant_id: session.tenantId == null ? null : BigInt(session.tenantId),
    },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) redirect("/login");

  const tenant =
    session.tenantId == null ? null : await getTenant(session.tenantId);
  if (session.tenantId != null && (!tenant || !tenant.active)) {
    redirect("/login?suspended=1");
  }

  const activeModules = await getActiveModules(session.tenantId);
  const navCtx = {
    role: session.role,
    tenantId: session.tenantId,
    tenantType: tenant?.type ?? null,
    activeModules,
    allowDoctorBranding: !!tenant?.allow_doctor_branding,
  };
  const groups = groupedNav(navCtx);

  const canBranding =
    can(session.role, "formtemplate:manage") ||
    (can(session.role, "branding:read") && navCtx.allowDoctorBranding);

  return (
    <DashboardShell
      user={{
        name: user.name,
        email: user.email,
        role: session.role,
        tenantName: tenant?.name ?? null,
        canBranding,
      }}
      groups={groups}
    >
      {children}
    </DashboardShell>
  );
}
