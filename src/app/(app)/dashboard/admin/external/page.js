import ExternalIntegrationsClient from "./ExternalIntegrationsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "External Integrations" };

export default function ExternalIntegrationsPage() {
  return <ExternalIntegrationsClient />;
}
