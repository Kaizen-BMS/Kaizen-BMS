import { guardPage } from "@/lib/pageGuard";
import RegistrationClient from "./RegistrationClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registration" };

export default async function RegistrationPage() {
  await guardPage({ action: "visit:create" });
  return <RegistrationClient />;
}
