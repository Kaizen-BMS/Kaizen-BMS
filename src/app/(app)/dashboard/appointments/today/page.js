import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import { getActiveModules } from "@/lib/modules";
import TodayClient from "./TodayClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today's appointments" };

export default async function TodayPage() {
  const { session, tenant } = await guardPage({ action: "appointment:read", modules: ["APPOINTMENTS"] });
  const mods = await getActiveModules(session.tenantId);
  return (
    <TodayClient
      canUpdate={can(session.role, "appointment:update")}
      canCheckIn={can(session.role, "visit:create")}
      // A hospital's front desk collects the consultation fee (needs Billing).
      canCollectFee={can(session.role, "fee:collect") && tenant?.type === "HOSPITAL" && mods.includes("BILLING")}
    />
  );
}
