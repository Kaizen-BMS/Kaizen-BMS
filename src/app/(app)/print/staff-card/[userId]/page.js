import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prismaClient";
import { resolveBranding } from "@/lib/branding";
import { serializeProfile } from "@/lib/staffDetails";
import { fmtDDMMYY } from "@/lib/dateFormat";
import { merge, PAPERS } from "@/lib/printSettings";
import LayoutRender from "@/components/hms/LayoutRender";
import PrintButton from "@/components/hms/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff card", robots: { index: false, follow: false } };

// A clean, printable ID card for one staff member — CLAUDE.md pharmacy/staff spec §35. Anyone with
// staff:manage can print anyone's card; a staff member without it can only print their own.
// The card's actual layout is the one saved in the Print Designer (Design admin > Staff card),
// exactly like the slip and bill — this page only supplies the real data for it to draw.
export default async function StaffCardPage({ params }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { userId } = await params;
  if (!/^\d{1,18}$/.test(String(userId))) redirect("/dashboard");
  const canManage = can(session.role, "staff:manage");
  if (!canManage && String(session.userId) !== String(userId)) redirect("/dashboard");

  const user = await prisma.users.findFirst({
    where: { id: BigInt(userId), tenant_id: BigInt(session.tenantId) },
    include: { staff_profiles: true },
  });
  if (!user) redirect("/dashboard");
  const p = serializeProfile(user.staff_profiles);
  const branding = await resolveBranding(session.tenantId, null);
  const t = await prisma.tenants.findUnique({ where: { id: BigInt(session.tenantId) }, select: { print_settings: true, name: true } });
  const layout = merge(t?.print_settings).staffCard.layout;
  const duty = p.dutyStart && p.dutyEnd ? `${p.dutyStart} – ${p.dutyEnd}` : "—";

  const data = {
    facility: branding.header.header_name || t?.name,
    name: user.name,
    employeeId: p.employeeId || "",
    designation: p.designation || String(user.role).replace(/_/g, " "),
    department: p.department || "",
    phone: p.phone || "",
    email: user.email,
    joinDate: p.joinDate ? fmtDDMMYY(p.joinDate) : "",
    duty,
    bloodGroup: p.bloodGroup || "",
    status: user.active ? "Active" : "Inactive",
    emergencyContact: p.emergencyContact || "",
  };
  const paper = PAPERS[layout.paper];

  return (
    <div className="p-4 print:p-0">
      <style>{`@page { size: ${paper.page}; margin: 0; }`}</style>
      <div className="print:hidden"><PrintButton label="Print card" /></div>
      <LayoutRender layout={layout} data={data} logo={branding.header.logo_url} photo={p.photo} />
    </div>
  );
}
