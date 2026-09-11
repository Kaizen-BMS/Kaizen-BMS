import { apiRoute, json } from "@/lib/apiRoute";
import { can } from "@/lib/rbac";
import { tenantDb } from "@/lib/prismaClient";
import { getTenant } from "@/lib/tenants";

export const dynamic = "force-dynamic";

// Raw (unmerged) rows for the settings screen: the tenant's own branding,
// this user's personal doctor-scope branding (if any), and whether the
// tenant currently allows doctors to set one up at all.
export const GET = apiRoute("branding:read", async (_request, { session }) => {
  const tenant = await getTenant(session.tenantId);
  const tenantBranding = await tenantDb.print_branding.findFirst({ where: { scope: "TENANT" } });

  let ownBranding = null;
  if (tenant?.allow_doctor_branding) {
    ownBranding = await tenantDb.print_branding.findFirst({
      where: { scope: "DOCTOR", doctor_user_id: BigInt(session.userId) },
    });
  }

  return json({
    tenantType: tenant?.type ?? null,
    tenantBranding,
    ownBranding,
    allowDoctorBranding: !!tenant?.allow_doctor_branding,
    canManageTenant: can(session.role, "branding:manage_tenant"),
    canManageOwn: can(session.role, "branding:manage_own") && !!tenant?.allow_doctor_branding,
  });
});
