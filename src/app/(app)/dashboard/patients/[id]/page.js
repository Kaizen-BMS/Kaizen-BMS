import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import PatientDetailClient from "./PatientDetailClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Patient" };

export default async function PatientPage({ params }) {
  const { session } = await guardPage({ action: "patient:read" });
  const { id } = await params;
  return <PatientDetailClient id={Number(id)} canVisit={can(session.role, "visit:create")} canBook={can(session.role, "appointment:create")} />;
}
