import { guardPage } from "@/lib/pageGuard";
import AnalyticsClient from "./AnalyticsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const { tenant } = await guardPage({ action: "analytics:view" });
  return <AnalyticsClient tenantType={tenant?.type || null} />;
}
