import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prismaClient";
import { resolveBranding } from "@/lib/branding";
import PrintButton from "@/components/hms/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lab Report", robots: { index: false, follow: false } };

const GENDER_LABEL = { MALE: "M", FEMALE: "F", OTHER: "Other" };
const FLAG_STYLE = {
  HIGH: "font-semibold text-red-600",
  LOW: "font-semibold text-red-600",
  ABNORMAL: "font-semibold text-red-600",
  NORMAL: "",
};

// A real diagnostic-lab report layout — see CLAUDE.md "Lab report". No
// sidebar/topbar (rendered through (app)/layout.js only), authenticated +
// tenant-scoped like /print/prescription.
export default async function LabReportPrintPage({ params }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Readable by lab staff or the ordering doctor's side.
  if (!can(session.role, "lab:read") && !can(session.role, "laborder:read")) {
    redirect("/dashboard");
  }

  const { labOrderId } = await params;
  const id = BigInt(labOrderId);

  const row = await prisma.lab_orders.findFirst({
    where: { id, tenant_id: BigInt(session.tenantId) },
    include: {
      consultations: { include: { users: { select: { name: true } } } },
      patients: { select: { name: true, age: true, gender: true } },
    },
  });
  if (!row || row.status !== "RESULTED") redirect("/dashboard");

  const { consultations: c, patients: p, ...rest } = row;
  const order = {
    ...rest,
    doctor_id: c?.doctor_id ?? null,
    doctor_name: c?.users?.name || row.referred_by || null,
    patient_name: p.name,
    patient_age: p.age,
    patient_gender: p.gender,
  };

  const results = typeof order.results === "string" ? JSON.parse(order.results) : order.results || [];

  const branding = await resolveBranding(session.tenantId, order.resulted_by);
  const signatureQualifications =
    branding.signature?.qualifications || branding.header.qualifications || "";

  // The signing pathologist: their own branding override if they've set one
  // up, else just the plain name of whoever finalized the report.
  const resulter = order.resulted_by
    ? await prisma.users.findUnique({ where: { id: BigInt(order.resulted_by) }, select: { name: true } })
    : null;
  const finalSignatureName = branding.signature?.name || resulter?.name || "";

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
          <p className="shrink-0 text-xs text-slate-500">Lab ID: LAB-{order.id}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <p><span className="text-slate-500">Patient: </span>{order.patient_name}</p>
        <p>
          <span className="text-slate-500">Age / Gender: </span>
          {order.patient_age ?? "—"} / {GENDER_LABEL[order.patient_gender] || "—"}
        </p>
        {order.doctor_name && (
          <p className="col-span-2">
            <span className="text-slate-500">Referring doctor: </span>{/^dr\.?\s/i.test(order.doctor_name) ? "" : "Dr. "}{order.doctor_name}
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-y border-slate-200 py-2 text-xs text-slate-600">
        <p>Collected: {order.collected_at ? new Date(order.collected_at).toLocaleString() : "—"}</p>
        <p>Received: {order.received_at ? new Date(order.received_at).toLocaleString() : "—"}</p>
        <p>Reported: {order.resulted_at ? new Date(order.resulted_at).toLocaleString() : "—"}</p>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
            <th className="py-1 pr-2">Test</th>
            <th className="py-1 pr-2">Result</th>
            <th className="py-1 pr-2">Units</th>
            <th className="py-1">Reference interval</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2 pr-2">{r.testName}</td>
              <td className={`py-2 pr-2 ${FLAG_STYLE[r.flag] || ""}`}>
                {r.result}
                {r.flag && r.flag !== "NORMAL" ? ` (${r.flag})` : ""}
              </td>
              <td className="py-2 pr-2">{r.units || "—"}</td>
              <td className="py-2">{r.referenceRange || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-20 flex justify-end">
        <div className="text-right text-sm">
          {(branding.signature?.image || branding.header.signature_image) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.signature?.image || branding.header.signature_image} alt="Signature" className="mb-1 ml-auto h-12" />
          ) : (
            <div className="mb-1 w-48 border-b border-slate-400" />
          )}
          <p className="font-semibold">{finalSignatureName}</p>
          {signatureQualifications && (
            <p className="text-xs text-slate-500">{signatureQualifications}</p>
          )}
        </div>
      </div>

      <p className="mt-8 border-t border-slate-200 pt-3 text-center text-[11px] italic text-slate-400">
        Results should be clinically correlated with the patient&apos;s history and
        examination findings by the treating physician.
      </p>

      {branding.header.footer_text && (
        <p className="mt-2 text-center text-xs text-slate-400">{branding.header.footer_text}</p>
      )}
    </div>
  );
}
