import { guardPage } from "@/lib/pageGuard";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await guardPage({ action: "reports:view", modules: ["BILLING"] });
  return <ReportsClient />;
}
