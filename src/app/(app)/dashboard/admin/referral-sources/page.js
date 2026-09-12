import ReferralSourcesClient from "./ReferralSourcesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referral sources" };

export default function ReferralSourcesPage() {
  return <ReferralSourcesClient />;
}
