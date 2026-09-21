import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import StaffManagementClient from "./StaffManagementClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff Management" };

export default async function StaffManagementPage() {
  const { session } = await guardPage({ action: "staffroster:read" });
  // staffroster:read/leaverequest:create are inherited by OWNER_* roles too
  // (same pre-existing quirk as attendance:self — those actions live on the
  // base DOCTOR/PHARMACIST/LAB_TECH arrays OWNER_* roles spread from). The
  // nav entry already hides this page from solo tenants; this is the same
  // belt-and-braces re-check the Attendance page does, since a solo tenant
  // genuinely has no staff hierarchy to manage.

  return (
    <StaffManagementClient
      canManage={can(session.role, "staff:manage")}
      canProxyAttendance={can(session.role, "attendance:proxy")}
      ownUserId={session.userId}
    />
  );
}
