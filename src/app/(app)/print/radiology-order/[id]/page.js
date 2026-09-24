import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prismaClient";
import { resolveBranding } from "@/lib/branding";
import { fmtDDMMYY, fmtDDMMYYTime } from "@/lib/dateFormat";
import { CONTRAST_LABEL, PREGNANCY_LABEL, LATERALITY_LABEL, SAFETY_LABEL } from "@/lib/radiologyCommon";
import PrintButton from "@/components/hms/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imaging requisition", robots: { index: false, follow: false } };

function Field({ label, children }) {
  return <p><span className="text-slate-500">{label}: </span>{children}</p>;
}

const GENDER = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };
const PRIORITY = { ROUTINE: "Routine", URGENT: "URGENT — same day", STAT: "STAT — immediately" };

// The doctor's imaging "prescription": what to scan, why, and what the radiologist must know first.
export default async function RadiologyRequisitionPage({ params }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "radiology:read") && !can(session.role, "radiology:create")) redirect("/dashboard");

  const { id } = await params;
  if (!/^\d{1,18}$/.test(String(id))) redirect("/dashboard");
  const row = await prisma.radiology_orders.findFirst({
    where: { id: BigInt(id), tenant_id: BigInt(session.tenantId) },
    include: { patients: { select: { name: true, age: true, gender: true, phone: true } } },
  });
  if (!row) redirect("/dashboard");

  const [doctor, study] = await Promise.all([
    row.ordered_by ? prisma.users.findFirst({ where: { id: row.ordered_by, tenant_id: BigInt(session.tenantId) }, select: { name: true } }) : null,
    row.service_id ? prisma.radiology_tests.findFirst({ where: { service_id: row.service_id }, select: { preparation: true } }) : null,
  ]);
  const branding = await resolveBranding(session.tenantId, row.ordered_by);
  const flags = row.safety_flags ? String(row.safety_flags).split(",").filter(Boolean) : [];
  const sigName = branding.signature?.name || doctor?.name || "";
  const sigQual = branding.signature?.qualifications || branding.header.qualifications || "";
  const sigImg = branding.signature?.image || branding.header.signature_image;

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
            {branding.header.address && <p className="text-xs text-slate-600">{branding.header.address}</p>}
            {branding.header.phone && <p className="text-xs text-slate-600">{branding.header.phone}</p>}
          </div>
          <div className="text-right text-xs text-slate-500">
            <p className="font-semibold text-slate-800">RAD-{String(row.id)}</p>
            <p>{fmtDDMMYYTime(row.created_at)}</p>
          </div>
        </div>
      </div>

      <h2 className="mt-4 text-center text-sm font-bold uppercase tracking-widest">Imaging requisition</h2>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Field label="Patient">{row.patients.name}</Field>
        <Field label="Age / Sex">{row.patients.age ?? "—"} / {GENDER[row.patients.gender] || "—"}</Field>
        <Field label="Phone">{row.patients.phone || "—"}</Field>
        <Field label="Date">{fmtDDMMYY(row.created_at)}</Field>
        <Field label="Referring doctor">{doctor?.name ? `${/^dr\.?\s/i.test(doctor.name) ? "" : "Dr. "}${doctor.name}` : "—"}</Field>
        <Field label="Priority"><span className={row.priority === "ROUTINE" ? "" : "font-bold text-red-600"}>{PRIORITY[row.priority] || row.priority}</span></Field>
      </div>

      <div className="mt-5 rounded-md border border-slate-300 p-3 text-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">Examination requested</p>
        <p className="mt-1 text-base font-semibold">{row.modality ? `${row.modality} — ` : ""}{row.study_name}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {row.body_part && <Field label="Region">{row.body_part}</Field>}
          <Field label="Side">{LATERALITY_LABEL[row.laterality] || "—"}</Field>
          <Field label="Contrast">{row.contrast ? CONTRAST_LABEL[row.contrast] : "Not specified"}</Field>
          <Field label="Patient mobility">{row.mobility === "WHEELCHAIR" ? "Wheelchair" : row.mobility === "STRETCHER" ? "Stretcher / bed" : "Walking"}</Field>
        </div>
      </div>

      <div className="mt-4 text-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">Clinical history &amp; question</p>
        <p className="mt-1 whitespace-pre-wrap">{row.clinical_indication || "—"}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {row.pregnancy_status !== "NOT_APPLICABLE" && (
          <Field label="Pregnancy"><span className={row.pregnancy_status === "YES" || row.pregnancy_status === "POSSIBLE" ? "font-bold text-red-600" : ""}>{PREGNANCY_LABEL[row.pregnancy_status]}</span></Field>
        )}
        <div className="col-span-2">
          <span className="text-slate-500">Safety screening: </span>
          {flags.length === 0 ? "No risk flags noted" : <span className="font-semibold text-red-600">{flags.map((f) => SAFETY_LABEL[f] || f).join(" · ")}</span>}
        </div>
      </div>

      {(study?.preparation || row.instructions) && (
        <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
          {study?.preparation && <p><span className="font-semibold">Patient preparation: </span>{study.preparation}</p>}
          {row.instructions && <p className={study?.preparation ? "mt-1" : ""}><span className="font-semibold">Instructions: </span>{row.instructions}</p>}
        </div>
      )}

      <div className="mt-20 flex justify-end">
        <div className="text-right text-sm">
          {sigImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sigImg} alt="Signature" className="mb-1 ml-auto h-12" />
          ) : (
            <div className="mb-1 w-48 border-b border-slate-400" />
          )}
          <p className="font-semibold">{sigName}</p>
          {sigQual && <p className="text-xs text-slate-500">{sigQual}</p>}
        </div>
      </div>

      {branding.header.footer_text && (
        <p className="mt-8 border-t border-slate-200 pt-2 text-center text-xs text-slate-400">{branding.header.footer_text}</p>
      )}
    </div>
  );
}
