import { guardPage } from "@/lib/pageGuard";
import ConsultationClient from "./ConsultationClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consultation" };

export default async function ConsultationPage({ params }) {
  await guardPage({ action: "consultation:read", modules: ["DOCTOR_OPD"] });
  const { visitId } = await params;
  return <ConsultationClient visitId={Number(visitId)} />;
}
