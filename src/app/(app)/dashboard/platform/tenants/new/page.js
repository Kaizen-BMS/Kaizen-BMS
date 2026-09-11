import { guardPage } from "@/lib/pageGuard";
import CreateTenantClient from "./CreateTenantClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create Tenant" };

export default async function CreateTenantPage() {
  await guardPage({ action: "tenant:manage" });
  return <CreateTenantClient />;
}
