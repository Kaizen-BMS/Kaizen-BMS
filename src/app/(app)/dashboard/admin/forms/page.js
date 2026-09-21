import { redirect } from "next/navigation";
import { guardPage } from "@/lib/pageGuard";
import FormBuilderClient from "./FormBuilderClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Form builder" };

// Forms are for hospitals and clinics; a solo pharmacy or lab has no patient forms to customise.
export default async function FormBuilderPage() {
  const { tenant } = await guardPage({ action: "formtemplate:manage" });
  if (tenant && !["HOSPITAL", "DOCTOR_SOLO"].includes(tenant.type)) redirect("/dashboard");
  return <FormBuilderClient />;
}
