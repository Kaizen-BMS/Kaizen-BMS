"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import { MyDutyCard, TeamDutyCard } from "@/components/hms/DutyWidget";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, BarChart, Bar } from "recharts";

// The events that plausibly change something on this dashboard — reused
// as-is (CLAUDE.md "Outbox — durable domain events": realtime stays
// completely independent of the Outbox, unchanged). A single debounced
// refetch on any of these, rather than hand-patching each counter, is the
// deliberate acceleration-phase tradeoff — see the final report.
const REFRESH_EVENTS = [
  "patient:created", "patient:updated", "visit:created", "visit:updated",
  "appointment:booked", "appointment:cancelled", "consultation:created",
  "prescription:created", "admission:created", "admission:discharged",
  "bed:updated", "dispense:created", "lab:result", "bill:created", "bill:paid",
];

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function KpiCard({ label, value, href }) {
  const body = (
    <div className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300">
      <p className="text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function FailedCard({ title }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <h3 className="text-sm font-semibold text-red-700">{title}</h3>
      <p className="mt-1 text-sm text-red-600">Couldn&apos;t load this section — the rest of the dashboard is unaffected.</p>
    </div>
  );
}

function SectionCard({ title, href, children, empty }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {href && (
          <Link href={href} className="text-xs text-slate-400 hover:text-slate-700">
            open →
          </Link>
        )}
      </div>
      {empty ? <p className="text-sm text-slate-400">{empty}</p> : children}
    </div>
  );
}

function Metric({ label, value, tone }) {
  const toneClass = tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-red-600" : "text-slate-900";
  return (
    <div className="flex items-baseline justify-between border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

/** A real, hoverable trend chart — same {date, value}[] shape the API already returned for the previous hand-rolled bars, just rendered with recharts for a proper axis/tooltip/gridline feel. */
function MiniBarChart({ data, formatValue }) {
  if (!data || data.length === 0) return <p className="text-sm text-slate-400">No data available.</p>;
  const fmt = formatValue || ((v) => v);
  return (
    <div style={{ width: "100%", height: 110 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="miniChartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 9 }} />
          <YAxis tick={{ fontSize: 9 }} width={0} />
          <Tooltip formatter={(v) => fmt(v)} labelFormatter={(d) => d} />
          <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} fill="url(#miniChartFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const ACTIVITY_ICON = {
  PatientRegistered: "👤", VisitCreated: "📋", ConsultationCompleted: "🩺",
  PrescriptionCreated: "💊", AppointmentBooked: "📅", AdmissionCreated: "🛏️",
  DischargeCompleted: "🏠", LabResultEntered: "🧪", MedicineDispensed: "💊",
  PaymentReceived: "💳",
};

const PBI_COLORS = ["#2563eb", "#0d9488", "#f59e0b", "#e11d48", "#7c3aed"];

/** Power-BI-style donut: proportions at a glance, hover for the exact number. */
function Donut({ data }) {
  const rows = data.filter((d) => d.value > 0);
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-slate-400">No data yet today.</p>;
  const total = rows.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-36 w-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
              {rows.map((_, i) => <Cell key={i} fill={PBI_COLORS[i % PBI_COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-lg font-semibold leading-none">{total}</p>
            <p className="text-[10px] text-slate-400">total</p>
          </div>
        </div>
      </div>
      <ul className="space-y-1 text-xs">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PBI_COLORS[i % PBI_COLORS.length] }} />
            <span className="text-slate-600">{r.name}</span>
            <span className="font-semibold">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBars({ data }) {
  return (
    <div style={{ height: Math.max(144, data.length * 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={84} interval={0} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(148,163,184,0.15)" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => <Cell key={i} fill={PBI_COLORS[i % PBI_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LiveBadge({ at }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Live · updated {at ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
    </span>
  );
}

export default function DashboardClient() {
  const [data, setData] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [days, setDays] = useState(7);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef(null);

  const load = useCallback(() => {
    apiGet(`/api/dashboard/overview?days=${days}`)
      .then((d) => {
        setData(d);
        setUpdatedAt(Date.now());
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const debouncedReload = useCallback(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 400);
  }, [load]);

  useRealtime(
    Object.fromEntries(REFRESH_EVENTS.map((e) => [e, debouncedReload])),
    load, // onResync — one fresh fetch on reconnect
  );

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600">Couldn&apos;t load the dashboard.</p>
        <button onClick={load} className="mt-3 rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm text-[var(--hms-btn-fg)]">
          Retry
        </button>
      </div>
    );
  }

  if (data.scope === "PLATFORM") return <PlatformDashboard data={data} />;
  return <TenantDashboard data={data} updatedAt={updatedAt} days={days} setDays={setDays} />;
}

function PlatformDashboard({ data }) {
  const typeRows = Object.entries(data.byType).map(([name, value]) => ({ name: name.replace(/_/g, " ").toLowerCase(), value }));
  const modRows = (data.modulesRented || []).map((m) => ({ name: m.name.replace(/_/g, " ").toLowerCase(), value: m.value })).sort((a, b) => b.value - a.value);
  const activePct = data.totalTenants ? Math.round((data.activeTenants / data.totalTenants) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Kaizen Platform</h1>
          <p className="text-sm text-slate-500">
            {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · Platform owner view
          </p>
        </div>
        <Link href="/dashboard/platform/tenants/new" className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">+ Create tenant</Link>
      </div>

      {/* one slim strip instead of big number boxes */}
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-5 sm:divide-y-0">
        {[["Facilities", data.totalTenants, "/dashboard/platform/tenants"], ["Active", `${data.activeTenants} (${activePct}%)`], ["Suspended", data.suspendedTenants], ["Organizations", data.organizations, "/dashboard/platform/organizations"], ["People with logins", data.users]].map(([l, v, href]) => {
          const body = <div className="px-4 py-3"><p className="text-[11px] uppercase tracking-wide text-slate-400">{l}</p><p className="text-xl font-semibold tabular-nums">{v}</p></div>;
          return href ? <Link key={l} href={href} className="hover:bg-slate-50">{body}</Link> : <div key={l}>{body}</div>;
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Facilities by type"><Donut data={typeRows} /></SectionCard>
        <SectionCard title="Modules in use" empty={modRows.length === 0 ? "No modules rented yet." : null}><StatusBars data={modRows} /></SectionCard>
        <SectionCard title="Health of the base">
          <div className="space-y-3 pt-1">
            <div>
              <div className="flex justify-between text-xs text-slate-500"><span>Active facilities</span><span>{activePct}%</span></div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${activePct}%` }} /></div>
            </div>
            {data.moduleInstances.slice(0, 5).map((m, i) => (
              <Metric key={i} label={`${m.module.replace(/_/g, " ")} — ${m.status.toLowerCase()}`} value={m.count} tone={m.status === "SUSPENDED" ? "warn" : undefined} />
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Facilities added, month by month"><MiniBarChart data={data.growth.map((g) => ({ date: `${g.date}-01`, value: g.value }))} /></SectionCard>
        <SectionCard title="Activity across the platform (last 14 days)"><MiniBarChart data={data.activity} /></SectionCard>
      </div>

      <SectionCard title="Recent facilities" href="/dashboard/platform/tenants" empty={data.recentTenants.length === 0 ? "No tenants yet." : null}>
        <div className="space-y-2">
          {data.recentTenants.map((t) => (
            <div key={t.id} className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0">
              <div>
                <span className="text-sm font-medium text-slate-800">{t.name}</span>
                <span className="ml-2 text-xs text-slate-400">{t.type.replace(/_/g, " ")}</span>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${t.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>{t.active ? "Active" : "Suspended"}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function Slicer({ days, setDays }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Period</span>
      {[[7, "Last 7 days"], [14, "14 days"], [30, "30 days"], [90, "90 days"]].map(([d, l]) => (
        <button
          key={d}
          onClick={() => setDays(d)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${days === d ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          {l}
        </button>
      ))}
      <span className="ml-auto text-xs text-slate-400">Charts and totals follow the period you pick</span>
    </div>
  );
}

const sum = (rows) => (rows || []).reduce((a, r) => a + Number(r.value || 0), 0);

function TenantDashboard({ data, updatedAt, days, setDays }) {
  const has = (k) => data.widgets.includes(k);
  const failed = (k) => data.failedWidgets?.includes(k);
  const money = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
       <div>
        <h1 className="text-2xl font-semibold">{data.tenant.name}</h1>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · Signed in as{" "}
          {data.role.replace(/_/g, " ").toLowerCase()}
        </p>
       </div>
       <LiveBadge at={updatedAt} />
      </div>

      {has("kpis") && data.kpis && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Today's patients" value={data.kpis.patientsToday} href="/dashboard/registration" />
          {data.kpis.appointmentsToday !== undefined && <KpiCard label="Today's appointments" value={data.kpis.appointmentsToday} href="/dashboard/appointments" />}
          <KpiCard label="OPD visits" value={data.kpis.opdVisitsToday} href="/dashboard/opd" />
          <KpiCard label="Emergency visits" value={data.kpis.emergencyVisitsToday} />
          {data.kpis.currentAdmissions !== undefined && <KpiCard label="Current admissions" value={data.kpis.currentAdmissions} href="/dashboard/ipd" />}
          {data.kpis.availableBeds !== undefined && <KpiCard label="Available beds" value={data.kpis.availableBeds} href="/dashboard/ipd" />}
          {data.kpis.pendingLabOrders !== undefined && <KpiCard label="Pending lab orders" value={data.kpis.pendingLabOrders} href="/dashboard/lab" />}
          {data.kpis.todaysCollection !== undefined && <KpiCard label="Today's collection" value={money(data.kpis.todaysCollection)} href="/dashboard/billing" />}
        </div>
      )}

      {data.charts && <Slicer days={days} setDays={setDays} />}

      {data.charts && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label={`Visits · ${days} days`} value={sum(data.charts.patientVisits)} />
          {data.charts.appointments && <KpiCard label={`Appointments booked · ${days} days`} value={sum(data.charts.appointments)} />}
          {data.charts.revenue && <KpiCard label={`Collected · ${days} days`} value={money(sum(data.charts.revenue))} />}
          <KpiCard label="Busiest day (visits)" value={(() => { const r = [...(data.charts.patientVisits || [])].sort((a, b) => b.value - a.value)[0]; return r && r.value ? `${r.date.slice(5)} · ${r.value}` : "—"; })()} />
        </div>
      )}

      {(data.patientFlow || data.appointments || data.charts) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {data.patientFlow && (
            <SectionCard title="Patient mix today">
              <Donut data={[
                { name: "OPD", value: data.patientFlow.opd },
                { name: "Emergency", value: data.patientFlow.emergency },
                { name: "Admissions", value: data.patientFlow.admissions },
              ]} />
            </SectionCard>
          )}
          {data.appointments && (
            <SectionCard title="Appointment status today">
              <StatusBars data={[
                { name: "Scheduled", value: data.appointments.scheduled },
                { name: "Completed", value: data.appointments.completed },
                { name: "Cancelled", value: data.appointments.cancelled },
                { name: "No-show", value: data.appointments.noShow },
              ]} />
            </SectionCard>
          )}
          {data.charts?.patientVisits && (
            <SectionCard title={`Visits — last ${days} days`}>
              <MiniBarChart data={data.charts.patientVisits} />
            </SectionCard>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {has("patientFlow") && data.patientFlow && (
          <SectionCard title="Patient Flow" href="/dashboard/registration">
            <Metric label="Registrations" value={data.patientFlow.registrations} />
            <Metric label="OPD" value={data.patientFlow.opd} />
            <Metric label="Emergency" value={data.patientFlow.emergency} />
            <Metric label="Direct admissions" value={data.patientFlow.admissions} />
          </SectionCard>
        )}
        {has("patientFlow") && !data.patientFlow && failed("patientFlow") && <FailedCard title="Patient Flow" />}

        {has("appointments") && data.appointments && (
          <SectionCard title="Appointments Today" href="/dashboard/appointments">
            <Metric label="Scheduled" value={data.appointments.scheduled} />
            <Metric label="Completed" value={data.appointments.completed} />
            <Metric label="Cancelled" value={data.appointments.cancelled} />
            <Metric label="No-show" value={data.appointments.noShow} />
          </SectionCard>
        )}
        {has("appointments") && !data.appointments && failed("appointments") && <FailedCard title="Appointments Today" />}

        {has("ipd") && data.ipd && (
          <SectionCard title="IPD / Beds" href="/dashboard/ipd">
            <Metric label="Occupied" value={data.ipd.occupied} />
            <Metric label="Available" value={data.ipd.available} />
            <Metric label="Maintenance" value={data.ipd.maintenance} tone={data.ipd.maintenance > 0 ? "warn" : undefined} />
            <Metric label="Admitted today" value={data.ipd.admissionsToday} />
            <Metric label="Discharged today" value={data.ipd.dischargesToday} />
          </SectionCard>
        )}
        {has("ipd") && !data.ipd && failed("ipd") && <FailedCard title="IPD / Beds" />}

        {has("pharmacy") && data.pharmacy && (
          <SectionCard title={`Pharmacy — ${data.pharmacy.instanceName}`} href="/dashboard/pharmacy">
            <Metric label="Low stock medicines" value={data.pharmacy.lowStock} tone={data.pharmacy.lowStock > 0 ? "warn" : undefined} />
            <Metric label="Near expiry" value={data.pharmacy.nearExpiry} tone={data.pharmacy.nearExpiry > 0 ? "warn" : undefined} />
            <Metric label="Dispensed today" value={data.pharmacy.dispensedToday} />
            <Metric label="Pending fulfillment" value={data.pharmacy.pendingFulfillment} />
          </SectionCard>
        )}
        {has("pharmacy") && !data.pharmacy && (failed("pharmacy") ? <FailedCard title="Pharmacy" /> : <SectionCard title="Pharmacy" empty="No pharmacy instance configured yet." />)}

        {has("lab") && data.lab && (
          <SectionCard title="Laboratory" href="/dashboard/lab">
            <Metric label="Pending orders" value={data.lab.pendingOrders} />
            <Metric label="Results pending" value={data.lab.resultsPending} />
            <Metric label="Completed today" value={data.lab.completedToday} />
          </SectionCard>
        )}
        {has("lab") && !data.lab && failed("lab") && <FailedCard title="Laboratory" />}

        {has("radiology") && data.radiology && (
          <SectionCard title="Radiology" href="/dashboard/radiology">
            <Metric label="Pending orders" value={data.radiology.pendingOrders} />
            <Metric label="In progress" value={data.radiology.inProgress} />
            <Metric label="Completed today" value={data.radiology.completedToday} />
          </SectionCard>
        )}
        {has("radiology") && !data.radiology && failed("radiology") && <FailedCard title="Radiology" />}

        {has("billing") && data.billing && (
          <SectionCard title="Billing" href="/dashboard/billing">
            <Metric label="Bills created today" value={data.billing.billsCreatedToday} />
            <Metric label="Payments today" value={data.billing.paymentsToday} />
            <Metric label="Today's collection" value={money(data.billing.todaysCollection)} />
            <Metric label="Pending amount" value={money(data.billing.pendingAmount)} tone={data.billing.pendingAmount > 0 ? "warn" : undefined} />
          </SectionCard>
        )}
        {has("billing") && !data.billing && failed("billing") && <FailedCard title="Billing" />}

        {has("workflows") && data.workflows && (
          <SectionCard title="Workflows" href="/dashboard/admin/workflows">
            <Metric label="Running" value={data.workflows.running} />
            <Metric label="Waiting" value={data.workflows.waiting} tone={data.workflows.waiting > 0 ? "warn" : undefined} />
            <Metric label="Failed" value={data.workflows.failed} tone={data.workflows.failed > 0 ? "warn" : undefined} />
          </SectionCard>
        )}
        {has("workflows") && !data.workflows && failed("workflows") && <FailedCard title="Workflows" />}

        {has("myDuty") && <MyDutyCard />}
        {has("teamDuty") && <TeamDutyCard />}
      </div>

      {has("charts") && data.charts && (
        <div className="grid gap-4 md:grid-cols-3">
          <SectionCard title="Patient Visits">
            <MiniBarChart data={data.charts.patientVisits} />
          </SectionCard>
          {data.charts.appointments && (
            <SectionCard title="Appointments">
              <MiniBarChart data={data.charts.appointments} />
            </SectionCard>
          )}
          {data.charts.revenue && (
            <SectionCard title="Revenue">
              <MiniBarChart data={data.charts.revenue} formatValue={money} />
            </SectionCard>
          )}
        </div>
      )}
      {has("charts") && !data.charts && failed("charts") && <FailedCard title="Last 7 days" />}

      <div className="grid gap-4 lg:grid-cols-3">
        {has("recentActivity") && data.recentActivity && (
          <div className="lg:col-span-2">
            <SectionCard title="Recent Activity" empty={!data.recentActivity.length ? "No recent activity." : null}>
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {data.recentActivity.map((a, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
                    <span className="text-slate-700">
                      <span className="mr-1.5">{ACTIVITY_ICON[a.type] || "•"}</span>
                      {a.label}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{timeAgo(a.at)}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}
        {has("recentActivity") && !data.recentActivity && failed("recentActivity") && (
          <div className="lg:col-span-2">
            <FailedCard title="Recent Activity" />
          </div>
        )}

        {has("quickActions") && data.quickActions?.length > 0 && (
          <SectionCard title="Quick Actions">
            <div className="flex flex-wrap gap-2">
              {data.quickActions.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                >
                  {a.label}
                </Link>
              ))}
            </div>
          </SectionCard>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-700">{data.tenant.solo ? "Your module" : "Active modules"}</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {data.activeModules.length === 0 && <li className="text-sm text-slate-400">None</li>}
          {data.activeModules.map((m) => (
            <li key={m} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {m.replace(/_/g, " ")}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
