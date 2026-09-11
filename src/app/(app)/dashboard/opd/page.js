import { guardPage } from "@/lib/pageGuard";
import OpdQueueClient from "./OpdQueueClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Doctor / OPD" };

export default async function OpdPage() {
  await guardPage({ action: "consultation:read", modules: ["DOCTOR_OPD"] });
  return <OpdQueueClient />;
}
