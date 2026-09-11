import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// The admin area (form builder, later: staff accounts) is HOSPITAL_ADMIN
// only. Server-side gate — not just a hidden nav link.
export default async function AdminLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "formtemplate:manage")) redirect("/dashboard");
  return children;
}
