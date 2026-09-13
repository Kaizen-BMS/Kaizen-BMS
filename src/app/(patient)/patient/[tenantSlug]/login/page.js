import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function PatientLoginPage({ params }) {
  const { tenantSlug } = await params;
  return <LoginClient tenantSlug={tenantSlug} />;
}
