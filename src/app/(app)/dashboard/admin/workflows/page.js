import WorkflowsClient from "./WorkflowsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workflows" };

export default function WorkflowsPage() {
  return <WorkflowsClient />;
}
