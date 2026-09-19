import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default function Page() {
  return <SettingsClient />;
}
