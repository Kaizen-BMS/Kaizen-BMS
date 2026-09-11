import { apiRoute, json } from "@/lib/apiRoute";
import { can } from "@/lib/rbac";
import { scopedQueryOne } from "@/lib/repo/tenant";
import { getTenant } from "@/lib/tenants";

export const dynamic = "force-dynamic";

// Raw (unmerged) rows for the settings screen: the tenant's own branding,
// this user's personal doctor-scope branding (if any), and whether the
// tenant currently allows doctors to set one up at all.
export const GET = apiRoute("branding:read", async (_request, { session }) => {
  const tenant = await getTenant(session.tenantId);
  const tenantBranding = await scopedQueryOne(
    "SELECT * FROM print_branding WHERE tenant_id = :tid AND scope = 'TENANT' LIMIT 1",
  );

  let ownBranding = null;
  if (tenant?.allow_doctor_branding) {
    ownBranding = await scopedQueryOne(
      "SELECT * FROM print_branding WHERE tenant_id = :tid AND scope = 'DOCTOR' AND doctor_user_id = :uid LIMIT 1",
      { uid: session.userId },
    );
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
