import ActivityLogClient from "./ActivityLogClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity log" };

export default function Page() {
  return <ActivityLogClient />;
}
