import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import AttendanceClient from "./AttendanceClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const { session } = await guardPage({ action: "attendance:self" });
  // Core feature (not module-gated), but only meaningful where there's a
  // staff hierarchy — a solo tenant is just its one owner-practitioner.


  return (
    <AttendanceClient
      canProxy={can(session.role, "attendance:proxy")}
      canManageStaff={can(session.role, "staffmember:manage")}
    />
  );
}
