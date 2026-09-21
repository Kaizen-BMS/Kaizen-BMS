import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prismaClient";
import { resolveBranding } from "@/lib/branding";
import LayoutRender from "@/components/hms/LayoutRender";
import PrintButton from "@/components/hms/PrintButton";
import { merge, PAPERS } from "@/lib/printSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receipt", robots: { index: false, follow: false } };

// Billing receipt — same PrintBranding system as prescriptions and lab
// reports (see CLAUDE.md "Print branding"). Itemized lines, discounts,
// payment history (mode + timestamp, supports multiple partial payments),
// refunds, and the running balance. GST line only renders when the
// tenant's branding carries a GSTIN — this system has no tax-rate/HSN
// catalog, so it prints what a GST invoice must show (seller GSTIN,
// itemization, invoice number) without computing tax amounts it has no
// authoritative rate for; see CLAUDE.md "Billing module" for why.
export default async function ReceiptPrintPage({ params }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.role, "bill:read")) redirect("/dashboard");

  const { billId } = await params;
  const id = BigInt(billId);

  const row = await prisma.bills.findFirst({
    where: { id, tenant_id: BigInt(session.tenantId) },
    include: {
      patients: { select: { name: true, age: true, phone: true } },
      bill_items: { orderBy: { id: "asc" } },
      payments: { orderBy: { paid_at: "asc" } },
      discounts: { orderBy: { id: "asc" } },
      refunds: { orderBy: { id: "asc" } },
    },
  });
  if (!row) redirect("/dashboard");

  const branding = await resolveBranding(session.tenantId, null);
  const tsettings = await prisma.tenants.findUnique({ where: { id: BigInt(session.tenantId) }, select: { print_settings: true } });
  const inv = merge(tsettings?.print_settings).invoice;
  const paper = PAPERS[inv.paper];

  const itemsTotal = row.bill_items.reduce((s, i) => s + Number(i.amount), 0);
  const discountTotal = row.discounts.reduce((s, d) => s + Number(d.amount), 0);
  const paidTotal = row.payments.reduce((s, p) => s + Number(p.amount), 0);
  const refundTotal = row.refunds.reduce((s, r) => s + Number(r.amount), 0);
  const netDue = Math.max(itemsTotal - discountTotal, 0);
  const balance = Math.max(netDue - (paidTotal - refundTotal), 0);
  const invoiceNo = `INV-${String(session.tenantId).padStart(4, "0")}-${String(row.id).padStart(6, "0")}`;

  const layout = inv.layout;
  const fmt = (n) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const data = {
    facility: branding.header.header_name || "",
    address: branding.header.address || "",
    phone: branding.header.phone || "",
    gstin: inv.showGstin ? branding.header.gstin || "" : "",
    footer: branding.header.footer_text || "",
    bill_to: row.patients.name,
    bill_to_phone: row.patients.phone || "",
    invoice_no: invoiceNo,
    issue_date: new Date(row.created_at).toLocaleDateString([], { dateStyle: "medium" }),
    status: balance <= 0 ? "Paid" : paidTotal > 0 ? "Part paid" : "Due",
    subtotal: fmt(itemsTotal),
    discount: fmt(discountTotal),
    total: fmt(netDue),
    paid: fmt(Math.max(paidTotal - refundTotal, 0)),
    balance: fmt(balance),
    currency: "₹",
  };
  const items = row.bill_items.map((it) => {
    const qty = it.quantity ? Number(it.quantity) : 1;
    const amount = Number(it.amount);
    return { description: it.description, qty, unit: it.unit_price ? Number(it.unit_price) : amount / qty, amount };
  });
  const totals = { subtotal: itemsTotal, discount: discountTotal, total: netDue, paid: Math.max(paidTotal - refundTotal, 0), balance };
  const pageSize = layout.paper.startsWith("THERMAL") ? `${paper.width} ${layout.h}mm` : paper.page;

  return (
    <div className="p-4 print:p-0">
      <style>{`@page { size: ${pageSize}; margin: 0; }`}</style>
      <PrintButton />
      <LayoutRender layout={layout} data={data} items={items} totals={totals} logo={branding.header.logo_url} />
    </div>
  );
}
