import { guardPage } from "@/lib/pageGuard";
import TenantsListClient from "./TenantsListClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tenants" };

export default async function TenantsListPage() {
  await guardPage({ action: "tenant:read" });
  return <TenantsListClient />;
}
