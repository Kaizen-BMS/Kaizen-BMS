import MasterDataClient from "./MasterDataClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Master Data" };

export default function MasterDataPage() {
  return <MasterDataClient />;
}
