import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getActiveModules } from "@/lib/modules";
import { getTenant, isSolo } from "@/lib/tenants";
import { prisma } from "@/lib/prismaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const TYPE_LABEL = {
  HOSPITAL: "Hospital",
  DOCTOR_SOLO: "Solo doctor practice",
  PHARMACY_SOLO: "Independent pharmacy",
  LAB_SOLO: "Diagnostic lab",
};

// Server component, no request/AsyncLocalStorage context — raw `prisma`
// throughout, every query explicitly tenant_id-scoped (same reasoning as
// dashboard/layout.js).
async function loadPlatformCounts() {
  const [tenants, activeTenants, users] = await Promise.all([
    prisma.tenants.count(),
    prisma.tenants.count({ where: { active: true } }),
    prisma.users.count({ where: { tenant_id: { not: null } } }),
  ]);
  return { tenants, activeTenants, users };
}

async function loadTenantOverview(tenantId, modules) {
  const tid = BigInt(tenantId);
  const active = new Set(modules);
  const jobs = {};

  jobs.patientsToday = prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS n FROM patients WHERE tenant_id = ? AND DATE(created_at) = CURDATE()",
    tid,
  );
  jobs.openVisits = prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM visits WHERE tenant_id = ? AND DATE(created_at) = CURDATE()
       AND status IN ('REGISTERED','TRIAGE','WITH_DOCTOR','PHARMACY','LAB','BILLING')`,
    tid,
  );
  jobs.referralsToday = prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS n FROM patients WHERE tenant_id = ? AND DATE(created_at) = CURDATE() AND referral_source_id IS NOT NULL",
    tid,
  );

  if (active.has("PHARMACY")) {
    // Low stock = total quantity for a medicine at/under its threshold
    // (default 10) — same rule as the Pharmacy inventory screen.
    jobs.lowStock = prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM (
         SELECT s.medicine_name, SUM(s.quantity) AS total, COALESCE(t.low_stock_threshold, 10) AS threshold
           FROM pharmacy_stock s
           LEFT JOIN pharmacy_thresholds t ON t.tenant_id = s.tenant_id AND t.medicine_name = s.medicine_name
          WHERE s.tenant_id = ?
          GROUP BY s.medicine_name, threshold
         HAVING total <= threshold
       ) low`,
      tid,
    );
    jobs.pendingPrescriptions = prisma.prescriptions.count({
      where: { tenant_id: tid, status: { in: ["PENDING", "PARTIALLY_FULFILLED"] } },
    });
  }
  if (active.has("LAB")) {
    jobs.pendingLabOrders = prisma.lab_orders.count({
      where: { tenant_id: tid, status: { in: ["ORDERED", "IN_PROGRESS"] } },
    });
  }
  if (active.has("IPD")) {
    jobs.bedsTotal = prisma.beds.count({ where: { tenant_id: tid } });
    jobs.bedsOccupied = prisma.beds.count({ where: { tenant_id: tid, status: "OCCUPIED" } });
  }
  if (active.has("BILLING")) {
    jobs.openBills = prisma.bills.count({ where: { tenant_id: tid, status: { in: ["OPEN", "PARTIALLY_PAID"] } } });
  }

  const keys = Object.keys(jobs);
  const values = await Promise.all(keys.map((k) => jobs[k]));
  const out = {};
  keys.forEach((k, i) => {
    const v = values[i];
    out[k] = Array.isArray(v) ? Number(v[0]?.n ?? 0) : v;
  });
  return out;
}

function StatCard({ label, value, href }) {
  const body = (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardHome() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.tenantId == null) {
    const counts = await loadPlatformCounts();
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Kaizen Platform</h1>
          <p className="text-sm text-slate-500">Signed in as SUPER ADMIN.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Tenants" value={counts.tenants} href="/dashboard/platform/tenants" />
          <StatCard label="Active tenants" value={counts.activeTenants} href="/dashboard/platform/tenants" />
          <StatCard label="Staff accounts (all tenants)" value={counts.users} />
        </div>
        <Link href="/dashboard/platform/tenants/new" className="inline-block rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">
          + Create tenant
        </Link>
      </div>
    );
  }

  const tenant = await getTenant(session.tenantId);
  const modules = await getActiveModules(session.tenantId);
  const solo = isSolo(tenant?.type);
  const stats = await loadTenantOverview(session.tenantId, modules);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{tenant?.name}</h1>
        <p className="text-sm text-slate-500">
          {TYPE_LABEL[tenant?.type] || tenant?.type} · signed in as{" "}
          {session.role.replace(/_/g, " ").toLowerCase()}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Patients registered today" value={stats.patientsToday} href="/dashboard/registration" />
        <StatCard label="Open visits today" value={stats.openVisits} href="/dashboard/registration" />
        {stats.referralsToday !== undefined && (
          <StatCard label="Via referral today" value={stats.referralsToday} />
        )}
        {modules.includes("PHARMACY") && (
          <StatCard label="Low stock medicines" value={stats.lowStock ?? 0} href="/dashboard/pharmacy" />
        )}
        {modules.includes("PHARMACY") && (
          <StatCard label="Prescriptions pending dispense" value={stats.pendingPrescriptions ?? 0} href="/dashboard/pharmacy" />
        )}
        {modules.includes("LAB") && (
          <StatCard label="Lab orders pending" value={stats.pendingLabOrders ?? 0} href="/dashboard/lab" />
        )}
        {modules.includes("IPD") && (
          <StatCard
            label="Beds occupied"
            value={`${stats.bedsOccupied ?? 0} / ${stats.bedsTotal ?? 0}`}
            href="/dashboard/ipd"
          />
        )}
        {modules.includes("BILLING") && (
          <StatCard label="Open bills" value={stats.openBills ?? 0} href="/dashboard/billing" />
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">
          {solo ? "Your module" : "Active modules"}
        </h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {modules.length === 0 && (
            <li className="text-sm text-slate-400">None</li>
          )}
          {modules.map((m) => (
            <li
              key={m}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
            >
              {m.replace(/_/g, " ")}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-slate-500">
        {solo
          ? "This is your single-purpose workspace — only your module's screens appear in the sidebar."
          : "Modules are rented by the Kaizen platform team; use the sidebar to open each area."}
      </p>
    </div>
  );
}
