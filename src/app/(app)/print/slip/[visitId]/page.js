import { fmtDDMMYY } from "@/lib/dateFormat";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prismaClient";
import { resolveBranding } from "@/lib/branding";
import { merge, PAPERS } from "@/lib/printSettings";
import LayoutRender from "@/components/hms/LayoutRender";
import PrintButton from "@/components/hms/PrintButton";
import AutoPrint from "@/components/hms/AutoPrint";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registration slip", robots: { index: false, follow: false } };

// The registration slip ("parcha"): patient, token, fee — laid out for the paper
// the facility chose in Settings › Printing.
export default async function SlipPage({ params, searchParams }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "patient:read")) redirect("/dashboard");
  const { visitId } = await params;
  const { auto } = await searchParams;
  if (!/^[0-9]{1,18}$/.test(String(visitId))) redirect("/dashboard");

  const tid = BigInt(session.tenantId);
  const visit = await prisma.visits.findFirst({ where: { id: BigInt(visitId), tenant_id: tid }, include: { patients: true } });
  if (!visit) redirect("/dashboard");
  const tenant = await prisma.tenants.findUnique({ where: { id: tid }, select: { print_settings: true, name: true } });
  const settings = merge(tenant?.print_settings);
  const b = await resolveBranding(session.tenantId, null);

  const bill = await prisma.bills.findFirst({ where: { visit_id: visit.id, tenant_id: tid, bill_type: "OPD" }, include: { payments: true } });
  const paid = bill ? bill.payments.reduce((s, p) => s + Number(p.amount), 0) : 0;

  const p = visit.patients;
  const layout = settings.slip.layout;
  const when = new Date(visit.created_at);
  const data = {
    facility: b.header.header_name || tenant?.name || "",
    address: b.header.address || "",
    phone: b.header.phone || "",
    gstin: b.header.gstin || "",
    footer: [settings.slip.footer, b.header.footer_text].filter(Boolean).join(" · "),
    patient: p.name,
    age: p.age ?? "",
    gender: p.gender ? String(p.gender).charAt(0) + String(p.gender).slice(1).toLowerCase() : "",
    phone_patient: p.phone || "",
    token: visit.token_number ?? "",
    reason: visit.reason || "",
    date: fmtDDMMYY(when),
    time: when.toLocaleTimeString([], { timeStyle: "short" }),
    fee: paid > 0 ? paid : "",
  };
  const paper = PAPERS[layout.paper];
  const pageSize = layout.paper.startsWith("THERMAL") ? `${paper.width} ${layout.h}mm` : paper.page;
  return (
    <div className="p-4 print:p-0">
      <style>{`@page { size: ${pageSize}; margin: 0; }`}</style>
      <div className="print:hidden">
        <PrintButton label="Print slip" />
        <p className="mb-3 text-xs text-slate-500">Paper: {paper.label}. Change the design in Settings › Printing.</p>
      </div>
      <LayoutRender layout={layout} data={data} logo={b.header.logo_url} />
      {auto === "1" && <AutoPrint />}
    </div>
  );
}
