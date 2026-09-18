import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import RadiologyClient from "./RadiologyClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Radiology" };

export default async function RadiologyPage() {
  const { session } = await guardPage({ action: "radiology:read", modules: ["RADIOLOGY"] });
  return (
    <RadiologyClient
      permissions={{
        canManage: can(session.role, "radiology:manage"),
        canReport: can(session.role, "radiology:report"),
      }}
    />
  );
}
