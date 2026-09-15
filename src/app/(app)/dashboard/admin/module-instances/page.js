import ModuleInstancesClient from "./ModuleInstancesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Module instances" };

export default function ModuleInstancesPage() {
  return <ModuleInstancesClient />;
}
