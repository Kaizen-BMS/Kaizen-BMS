import { guardPage } from "@/lib/pageGuard";
import ConsultationClient from "./ConsultationClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consultation" };

export default async function ConsultationPage({ params }) {
  const { session } = await guardPage({ action: "consultation:read", modules: ["DOCTOR_OPD"] });
  const { visitId } = await params;
  return (
    <ConsultationClient
      visitId={Number(visitId)}
      // Follow-up scheduling books against the DOCTOR'S OWN availability —
      // doctor-initiated by design (see CLAUDE.md "Appointment
      // Scheduling"), not a general booking-desk action.
      doctorUserId={session.role === "DOCTOR" ? session.userId : null}
    />
  );
}
