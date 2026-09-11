import { guardPage } from "@/lib/pageGuard";
import TenantDetailClient from "./TenantDetailClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tenant detail" };

export default async function TenantDetailPage({ params }) {
  await guardPage({ action: "tenant:read" });
  const { id } = await params;
  return <TenantDetailClient tenantId={id} />;
}
