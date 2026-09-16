import ContractsClient from "./ContractsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data Contracts" };

export default function ContractsPage() {
  return <ContractsClient />;
}
