import { guardPage } from "@/lib/pageGuard";
import PlatformAnalyticsClient from "./PlatformAnalyticsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform Analytics" };

export default async function PlatformAnalyticsPage() {
  await guardPage({ action: "analytics:platform" });
  return <PlatformAnalyticsClient />;
}
