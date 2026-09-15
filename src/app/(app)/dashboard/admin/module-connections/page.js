import ModuleConnectionsClient from "./ModuleConnectionsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Module connections" };

export default function ModuleConnectionsPage() {
  return <ModuleConnectionsClient />;
}
