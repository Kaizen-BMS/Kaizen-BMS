import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import AppointmentsClient from "./AppointmentsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Appointments" };

export default async function AppointmentsPage() {
  const { session } = await guardPage({ action: "appointment:read", modules: ["APPOINTMENTS"] });
  return (
    <AppointmentsClient
      canBook={can(session.role, "appointment:create")}
      canUpdate={can(session.role, "appointment:update")}
      canManageSlots={can(session.role, "doctorslot:manage")}
      isDoctor={session.role === "DOCTOR"}
      ownUserId={session.userId}
    />
  );
}
