import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

export default async function BillingPage() {
  const { session } = await guardPage({ action: "bill:read", modules: ["BILLING"] });
  return (
    <BillingClient
      permissions={{
        canCreate: can(session.role, "bill:create"),
        canUpdate: can(session.role, "bill:update"),
      }}
    />
  );
}
