import { guardPage } from "@/lib/pageGuard";
import PatientsClient from "./PatientsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Patients" };

export default async function PatientsPage() {
  await guardPage({ action: "patient:read" });
  return <PatientsClient />;
}
