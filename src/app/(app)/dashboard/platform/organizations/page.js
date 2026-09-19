import { guardPage } from "@/lib/pageGuard";
import OrganizationsAdminClient from "./OrganizationsAdminClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organizations" };

export default async function OrganizationsAdminPage() {
  await guardPage({ action: "tenant:read" });
  return <OrganizationsAdminClient />;
}
