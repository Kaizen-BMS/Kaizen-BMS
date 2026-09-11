import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prismaClient";
import { resolveBranding } from "@/lib/branding";
import PrintButton from "@/components/hms/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prescription", robots: { index: false, follow: false } };

const GENDER_LABEL = { MALE: "M", FEMALE: "F", OTHER: "Other" };

// A real clinical document, not the dashboard page with a print button on
// it: no sidebar/topbar ((app)/layout.js has neither — only
// dashboard/layout.js adds the shell), print-optimized layout. Still
// authenticated + tenant-scoped like every other page — proxy.js covers
// /print/:path* the same as /dashboard/:path*.
export default async function PrescriptionPrintPage({ params }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "prescription:read")) redirect("/dashboard");

  const { prescriptionId } = await params;
  const id = BigInt(prescriptionId);

  const row = await prisma.prescriptions.findFirst({
    where: { id, tenant_id: BigInt(session.tenantId) },
    include: {
      consultations: { include: { users: { select: { name: true } } } },
      visits: { include: { patients: { select: { name: true, age: true, gender: true } } } },
      prescription_items: { orderBy: { id: "asc" } },
    },
  });
  if (!row) redirect("/dashboard");

  const { consultations: c, visits: v, prescription_items: items, ...rest } = row;
  const prescription = {
    ...rest,
    diagnosis: c.diagnosis,
    consultation_at: c.created_at,
    doctor_id: c.doctor_id,
    doctor_name: c.users.name,
    patient_name: v.patients.name,
    patient_age: v.patients.age,
    patient_gender: v.patients.gender,
  };

  const branding = await resolveBranding(session.tenantId, prescription.doctor_id);
  const signatureName = branding.signature?.name || prescription.doctor_name;
  const signatureQualifications =
    branding.signature?.qualifications || branding.header.qualifications || "";

  return (
    <div className="mx-auto max-w-2xl p-8 print:max-w-none print:p-0">
      <PrintButton />

      <div className="border-b-2 border-slate-900 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            {branding.header.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.header.logo_url} alt="" className="mb-2 h-12" />
            )}
            <h1 className="text-xl font-bold">{branding.header.header_name}</h1>
            {branding.header.address && (
              <p className="text-xs text-slate-600">{branding.header.address}</p>
            )}
            {branding.header.phone && (
              <p className="text-xs text-slate-600">{branding.header.phone}</p>
            )}
          </div>
          <p className="shrink-0 text-xs text-slate-500">
            {new Date(prescription.consultation_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <p>
          <span className="text-slate-500">Patient: </span>
          {prescription.patient_name}
        </p>
        <p>
          <span className="text-slate-500">Age / Gender: </span>
          {prescription.patient_age ?? "—"} / {GENDER_LABEL[prescription.patient_gender] || "—"}
        </p>
      </div>
      {prescription.diagnosis && (
        <p className="mt-2 text-sm">
          <span className="text-slate-500">Diagnosis: </span>
          {prescription.diagnosis}
        </p>
      )}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Medicine</th>
            <th className="py-1 pr-2">Dosage / Duration</th>
            <th className="py-1">Qty</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id} className="border-b border-slate-100">
              <td className="py-2 pr-2">{i + 1}</td>
              <td className="py-2 pr-2 font-medium">{it.medicine_name}</td>
              <td className="py-2 pr-2">{it.dosage || "—"}</td>
              <td className="py-2">{it.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-20 flex justify-end">
        <div className="text-right text-sm">
          <div className="mb-1 w-40 border-b border-slate-400" />
          <p className="font-semibold">{signatureName}</p>
          {signatureQualifications && (
            <p className="text-xs text-slate-500">{signatureQualifications}</p>
          )}
        </div>
      </div>

      {branding.header.footer_text && (
        <p className="mt-8 border-t border-slate-200 pt-2 text-center text-xs text-slate-400">
          {branding.header.footer_text}
        </p>
      )}
    </div>
  );
}
