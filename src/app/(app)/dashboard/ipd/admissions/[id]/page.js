import { guardPage } from "@/lib/pageGuard";
import { can } from "@/lib/rbac";
import AdmissionDetailClient from "./AdmissionDetailClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admission" };

export default async function AdmissionPage({ params }) {
  const { session } = await guardPage({ action: "admission:read", modules: ["IPD"] });
  const { id } = await params;
  return (
    <AdmissionDetailClient
      admissionId={Number(id)}
      canAddNote={can(session.role, "nursingnote:create")}
    />
  );
}
