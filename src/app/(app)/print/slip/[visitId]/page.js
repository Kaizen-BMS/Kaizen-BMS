import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prismaClient";
import { resolveBranding } from "@/lib/branding";
import { merge, PAPERS } from "@/lib/printSettings";
import SlipView from "@/components/hms/SlipView";
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
  const data = {
    name: p.name,
    age: p.age,
    gender: p.gender,
    phone: p.phone,
    token: visit.token_number,
    reason: visit.reason,
    when: new Date(visit.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
    fee: paid > 0 ? paid : null,
  };
  const paper = PAPERS[settings.slip.paper];
  return (
    <div className="p-4 print:p-0">
      <style>{`@page { size: ${paper.page}; margin: 6mm; }`}</style>
      <div className="print:hidden">
        <PrintButton label="Print slip" />
        <p className="mb-3 text-xs text-slate-500">Paper: {paper.label}. Change it in Settings › Printing.</p>
      </div>
      <SlipView settings={settings} branding={{ name: b.header.header_name || tenant?.name, logo: b.header.logo_url, address: b.header.address, phone: b.header.phone }} data={data} />
      {auto === "1" && <AutoPrint />}
    </div>
  );
}
