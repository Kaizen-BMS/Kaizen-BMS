import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import LabClient from "./LabClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lab" };

export default async function LabPage() {
  const { session } = await guardPage({ action: "lab:read", modules: ["LAB"] });
  return (
    <LabClient
      permissions={{
        canCollect: can(session.role, "lab:collect"),
        canReceive: can(session.role, "lab:receive"),
        canResult: can(session.role, "lab:result"),
        canWalkin: can(session.role, "lab:walkin"),
        canManageTests: can(session.role, "labtest:manage"),
      }}
    />
  );
}
