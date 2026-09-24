import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prismaClient";
import { resolveBranding } from "@/lib/branding";
import { fmtDDMMYY, fmtDDMMYYTime } from "@/lib/dateFormat";
import { CONTRAST_LABEL, LATERALITY_LABEL } from "@/lib/radiologyCommon";
import PrintButton from "@/components/hms/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Radiology report", robots: { index: false, follow: false } };

function Field({ label, children }) {
  return <p><span className="text-slate-500">{label}: </span>{children}</p>;
}

const GENDER = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

export default async function RadiologyReportPage({ params }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "radiology:read") && !can(session.role, "radiology:create")) redirect("/dashboard");

  const { id } = await params;
  if (!/^\d{1,18}$/.test(String(id))) redirect("/dashboard");
  const row = await prisma.radiology_orders.findFirst({
    where: { id: BigInt(id), tenant_id: BigInt(session.tenantId) },
    include: { patients: { select: { name: true, age: true, gender: true } } },
  });
  if (!row || row.status !== "COMPLETED") redirect("/dashboard");

  const [doctor, reporter] = await Promise.all([
    row.ordered_by ? prisma.users.findFirst({ where: { id: row.ordered_by, tenant_id: BigInt(session.tenantId) }, select: { name: true } }) : null,
    row.reported_by ? prisma.users.findFirst({ where: { id: row.reported_by, tenant_id: BigInt(session.tenantId) }, select: { name: true } }) : null,
  ]);
  const branding = await resolveBranding(session.tenantId, row.reported_by);
  const sigName = branding.signature?.name || reporter?.name || "";
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
          <p className="shrink-0 text-xs text-slate-500">Report ID: RAD-{String(row.id)}</p>
        </div>
      </div>

      <h2 className="mt-4 text-center text-sm font-bold uppercase tracking-widest">Radiology report</h2>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Field label="Patient">{row.patients.name}</Field>
        <Field label="Age / Sex">{row.patients.age ?? "—"} / {GENDER[row.patients.gender] || "—"}</Field>
        <Field label="Referring doctor">{doctor?.name ? `${/^dr\.?\s/i.test(doctor.name) ? "" : "Dr. "}${doctor.name}` : "—"}</Field>
        <Field label="Reported">{fmtDDMMYYTime(row.reported_at || row.completed_at)}</Field>
        <Field label="Ordered">{fmtDDMMYY(row.created_at)}</Field>
        {row.contrast && <Field label="Contrast">{CONTRAST_LABEL[row.contrast]}</Field>}
      </div>

      <div className="mt-5 rounded-md border border-slate-300 p-3 text-sm">
        <p className="text-base font-semibold">{row.modality ? `${row.modality} — ` : ""}{row.study_name}{row.laterality && row.laterality !== "NA" ? ` (${LATERALITY_LABEL[row.laterality]})` : ""}</p>
        {row.clinical_indication && <p className="mt-1 text-slate-600"><span className="text-slate-500">Clinical question: </span>{row.clinical_indication}</p>}
      </div>

      {row.findings && (
        <div className="mt-5 text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Findings</p>
          <p className="mt-1 whitespace-pre-wrap">{row.findings}</p>
        </div>
      )}
      <div className="mt-5 text-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">Impression</p>
        <p className="mt-1 whitespace-pre-wrap font-semibold">{row.impression}</p>
      </div>

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

      <p className="mt-8 border-t border-slate-200 pt-3 text-center text-[11px] italic text-slate-400">
        Imaging findings should be correlated clinically by the treating physician.
      </p>
      {branding.header.footer_text && <p className="mt-2 text-center text-xs text-slate-400">{branding.header.footer_text}</p>}
    </div>
  );
}
