import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prismaClient";
import { resolveBranding } from "@/lib/branding";
import { merge, PAPERS } from "@/lib/printSettings";
import { SAMPLE_SLIP, SAMPLE_INVOICE, SAMPLE_ITEMS, SAMPLE_TOTALS } from "@/lib/printSample";
import LayoutRender from "@/components/hms/LayoutRender";
import PrintButton from "@/components/hms/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test print", robots: { index: false, follow: false } };

// Test print with sample values, using the saved layout.
export default async function SamplePage({ params }) {
  const session = await getSession();
  if (!session || !session.tenantId) redirect("/login");
  const { doc } = await params;
  const kind = doc === "invoice" ? "invoice" : "slip";
  const t = await prisma.tenants.findUnique({ where: { id: BigInt(session.tenantId) }, select: { print_settings: true, name: true } });
  const layout = merge(t?.print_settings)[kind].layout;
  const b = await resolveBranding(session.tenantId, null);
  const data = { facility: b.header.header_name || t?.name, address: b.header.address || "", phone: b.header.phone || "", gstin: b.header.gstin || "", footer: b.header.footer_text || "", ...(kind === "slip" ? SAMPLE_SLIP : SAMPLE_INVOICE) };
  const p = PAPERS[layout.paper];
  return (
    <div className="p-4 print:p-0">
      <style>{`@page { size: ${layout.paper.startsWith("THERMAL") ? `${p.width} ${layout.h}mm` : p.page}; margin: 0; }`}</style>
      <div className="print:hidden"><PrintButton label="Print test page" /></div>
      <LayoutRender layout={layout} data={data} items={kind === "invoice" ? SAMPLE_ITEMS : null} totals={SAMPLE_TOTALS} logo={b.header.logo_url} />
    </div>
  );
}
