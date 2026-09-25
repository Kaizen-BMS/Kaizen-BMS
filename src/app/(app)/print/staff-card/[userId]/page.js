import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prismaClient";
import { resolveBranding } from "@/lib/branding";
import { serializeProfile } from "@/lib/staffDetails";
import { fmtDDMMYY } from "@/lib/dateFormat";
import PrintButton from "@/components/hms/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff card", robots: { index: false, follow: false } };

// A clean, printable ID card for one staff member — CLAUDE.md pharmacy/staff spec §35. Anyone with
// staff:manage can print anyone's card; a staff member without it can only print their own.
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
  const duty = p.dutyStart && p.dutyEnd ? `${p.dutyStart} – ${p.dutyEnd}` : null;

  return (
    <div className="mx-auto max-w-sm p-8 print:max-w-none print:p-0">
      <style>{"@page { size: A5 portrait; margin: 10mm; }"}</style>
      <PrintButton label="Print card" />
      <div className="overflow-hidden rounded-2xl border-2 border-slate-800 print:rounded-none">
        <div className="bg-slate-900 px-4 py-3 text-center text-white">
          {branding.header.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.header.logo_url} alt="" className="mx-auto mb-1 h-8" />
          )}
          <p className="text-sm font-bold">{branding.header.header_name}</p>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            {p.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photo} alt={user.name} className="h-20 w-20 rounded-lg border border-slate-300 object-cover" />
            ) : (
              <div className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-slate-300 text-2xl font-semibold text-slate-400">{user.name.charAt(0).toUpperCase()}</div>
            )}
            <div>
              <p className="text-lg font-bold leading-tight">{user.name}</p>
              {p.employeeId && <p className="text-xs text-slate-500">{p.employeeId}</p>}
              <p className="text-sm text-slate-600">{p.designation || String(user.role).replace(/_/g, " ")}</p>
              {p.department && <p className="text-xs text-slate-500">{p.department}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs">
            {p.phone && <Field label="Phone" value={p.phone} />}
            <Field label="Email" value={user.email} />
            {p.joinDate && <Field label="Joining" value={fmtDDMMYY(p.joinDate)} />}
            {duty && <Field label="Duty" value={duty} />}
            {p.bloodGroup && <Field label="Blood Group" value={p.bloodGroup} bold />}
            <Field label="Status" value={user.active ? "Active" : "Inactive"} />
            {p.emergencyContact && <Field label="Emergency contact" value={p.emergencyContact} span />}
          </div>
        </div>
        <p className="border-t border-slate-200 bg-slate-50 px-4 py-1.5 text-center text-[10px] text-slate-400">This card belongs to {branding.header.header_name} and must be returned on separation.</p>
      </div>
    </div>
  );
}

function Field({ label, value, bold, span }) {
  return (
    <div className={span ? "col-span-2" : undefined}>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={bold ? "font-bold text-red-600" : "text-slate-700"}>{value}</p>
    </div>
  );
}
