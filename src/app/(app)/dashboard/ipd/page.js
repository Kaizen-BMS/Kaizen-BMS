import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import BedBoardClient from "./BedBoardClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "IPD / Beds" };

export default async function IpdPage() {
  const { session } = await guardPage({ action: "bed:read", modules: ["IPD"] });
  return (
    <BedBoardClient
      permissions={{
        canAdmit: can(session.role, "admission:create"),
        canDischarge: can(session.role, "admission:update"),
        canManageBeds: can(session.role, "bed:manage"),
      }}
    />
  );
}
