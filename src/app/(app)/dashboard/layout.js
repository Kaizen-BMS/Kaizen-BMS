import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prismaClient";
import { getActiveModules } from "@/lib/modules";
import { getTenant } from "@/lib/tenants";
import { groupedNav } from "@/lib/navRegistry";
import { can } from "@/lib/rbac";
import { sessionFacilityOk } from "@/lib/orgAccess";
import DashboardShell from "./DashboardShell";

export const dynamic = "force-dynamic";

// proxy.js blocks unauthenticated requests; this re-check is defense in
// depth and assembles everything the shell needs. The sidebar is derived
// from the nav registry here — never hand-built per module.
export default async function DashboardLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Looked up by id only: a switched owner session legitimately acts in a
  // tenant that is not the user row's own home tenant; ownership is verified
  // by sessionFacilityOk() below instead.
  const user = await prisma.users.findFirst({
    where: { id: BigInt(session.userId) },
    select: { id: true, name: true, email: true, role: true, tenant_id: true },
  });
  if (!user) redirect("/login");
  if (session.tenantId != null && user.tenant_id != null && Number(user.tenant_id) !== session.tenantId && !(await sessionFacilityOk(session))) redirect("/login");

  const tenant =
    session.tenantId == null ? null : await getTenant(session.tenantId);
  if (session.tenantId != null && (!tenant || !tenant.active || tenant.owner_enabled === false)) {
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
