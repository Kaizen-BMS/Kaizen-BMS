import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getTenant } from "@/lib/tenants";
import ModulesClient from "./ModulesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modules" };

// Same tenantTypes:["HOSPITAL"] boundary as its sibling admin screens
// (module-instances, module-connections) — a solo tenant has exactly one
// instance of its one module by definition, so there's nothing here for
// it to select/manage either (CLAUDE.md "Module Management").
// dashboard/admin/layout.js already gates HOSPITAL_ADMIN-only.
export default async function ModulesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const tenant = session.tenantId == null ? null : await getTenant(session.tenantId);
  if (!tenant || tenant.type !== "HOSPITAL") redirect("/dashboard");
  return <ModulesClient />;
}
