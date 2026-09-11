import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prismaClient";
import { resolveBranding } from "@/lib/branding";
import PrintButton from "@/components/hms/PrintButton";

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

  const itemsTotal = row.bill_items.reduce((s, i) => s + Number(i.amount), 0);
  const discountTotal = row.discounts.reduce((s, d) => s + Number(d.amount), 0);
  const paidTotal = row.payments.reduce((s, p) => s + Number(p.amount), 0);
  const refundTotal = row.refunds.reduce((s, r) => s + Number(r.amount), 0);
  const netDue = Math.max(itemsTotal - discountTotal, 0);
  const balance = Math.max(netDue - (paidTotal - refundTotal), 0);
  const invoiceNo = `INV-${String(session.tenantId).padStart(4, "0")}-${String(row.id).padStart(6, "0")}`;

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
            {branding.header.gstin && <p className="text-xs text-slate-600">GSTIN: {branding.header.gstin}</p>}
          </div>
          <div className="shrink-0 text-right text-xs text-slate-500">
            <p className="font-semibold text-slate-700">{invoiceNo}</p>
            <p>{new Date(row.created_at).toLocaleDateString()}</p>
            <p className="mt-1 uppercase">{row.bill_type} receipt</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <p><span className="text-slate-500">Patient: </span>{row.patients.name}</p>
        <p><span className="text-slate-500">Age / Phone: </span>{row.patients.age ?? "—"} / {row.patients.phone}</p>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Description</th>
            <th className="py-1 pr-2">Category</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {row.bill_items.map((it, i) => (
            <tr key={it.id} className="border-b border-slate-100">
              <td className="py-2 pr-2">{i + 1}</td>
              <td className="py-2 pr-2 font-medium">{it.description}</td>
              <td className="py-2 pr-2 text-slate-500">{it.source}</td>
              <td className="py-2 text-right">₹{Number(it.amount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>₹{itemsTotal.toFixed(2)}</span></div>
        {row.discounts.map((d) => (
          <div key={d.id} className="flex justify-between text-amber-700">
            <span>Discount ({d.reason})</span><span>-₹{Number(d.amount).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
          <span>Net amount</span><span>₹{netDue.toFixed(2)}</span>
        </div>
      </div>

      {row.payments.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase text-slate-500">Payments received</p>
          <table className="mt-1 w-full text-xs">
            <tbody>
              {row.payments.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-1">{new Date(p.paid_at).toLocaleString()}</td>
                  <td className="py-1">{p.mode}</td>
                  <td className="py-1 text-right">₹{Number(p.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {row.refunds.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Refunds</p>
          <table className="mt-1 w-full text-xs">
            <tbody>
              {row.refunds.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-1">{new Date(r.refunded_at).toLocaleString()}</td>
                  <td className="py-1">{r.reason}</td>
                  <td className="py-1 text-right text-red-700">-₹{Number(r.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 ml-auto w-64 border-t border-slate-300 pt-1 text-sm">
        <div className="flex justify-between text-base font-bold">
          <span>Balance due</span><span>₹{balance.toFixed(2)}</span>
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
