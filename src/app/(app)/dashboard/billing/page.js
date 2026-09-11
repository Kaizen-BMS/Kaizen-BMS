import { guardPage } from "@/lib/pageGuard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

export default async function BillingPage() {
  await guardPage({ action: "bill:read", modules: ["BILLING"] });
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Billing</h1>
      <p className="text-sm text-slate-500">
        Bill aggregation across consultation, pharmacy and lab charges, payment
        recording, and receipt printing — built in the Billing module step.
      </p>
    </div>
  );
}
