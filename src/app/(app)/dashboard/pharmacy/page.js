import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import PharmacyClient from "./PharmacyClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pharmacy" };

export default async function PharmacyPage() {
  const { session } = await guardPage({ action: "stock:read", modules: ["PHARMACY"] });
  return (
    <PharmacyClient
      permissions={{
        canDispense: can(session.role, "dispense:create"),
        canStockIn: can(session.role, "stock:create"),
        canAdjust: can(session.role, "stock:adjust"),
      }}
    />
  );
}
