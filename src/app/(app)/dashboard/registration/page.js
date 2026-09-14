import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import RegistrationClient from "./RegistrationClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registration" };

export default async function RegistrationPage() {
  const { session } = await guardPage({ action: "visit:create" });
  return (
    <RegistrationClient
      canManageReferrals={can(session.role, "referral:manage")}
      canOverrideToken={can(session.role, "visit:override_token")}
    />
  );
}
