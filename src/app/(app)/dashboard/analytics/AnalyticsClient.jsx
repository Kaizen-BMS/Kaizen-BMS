"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/components/hms/api";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// Analytics + Rollup System UI. Reads exclusively from the pre-aggregated
// analytics_daily_tenant/dimension tables via GET /api/analytics/<domain>
// — never a live full-table scan from the browser's perspective. Every
// chart below renders the exact same `data.daily`/breakdown arrays the
// plain-number version already fetched — this is a presentation change
// only, no new backend query, no new endpoint.

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "12mo", label: "12 months" },
  { key: "custom", label: "Custom" },
];

// One small, consistent palette reused across every chart on this page —
// a viewer learns "blue = this metric" once and it holds everywhere.
const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : "—";
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }) : "—";
}

function shortDate(d) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function Card({ label, value, tone }) {
  const toneClass = tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-red-600" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children, empty }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="mb-2 text-sm font-semibold text-slate-700">{title}</p>
      {empty ? <p className="py-10 text-center text-sm text-slate-400">{empty}</p> : <div style={{ width: "100%", height: 260 }}>{children}</div>}
    </div>
  );
}

/** A trend line/bar chart over the range's daily rollup rows — the "Power BI feel": every domain gets a real visual trend, not just an end-of-range total. */
function TrendChart({ daily, series, kind = "line" }) {
  const rows = (daily || []).map((d) => ({ ...d, _label: shortDate(d.date) }));
  if (rows.length === 0) return null;
  const Chart = kind === "bar" ? BarChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Chart data={rows} margin={{ top: 5, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="_label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) =>
          kind === "bar" ? (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color || PALETTE[i % PALETTE.length]} radius={[3, 3, 0, 0]} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color || PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  );
}

/** A category breakdown (ward occupancy, top medicines, doctor workload, ...) as a bar chart — the same rows the table below also shows, just visualized. */
function BreakdownBarChart({ rows, dataKey = "count", nameKey = "label" }) {
  const top = (rows || []).slice(0, 8);
  if (top.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={top} layout="vertical" margin={{ top: 5, right: 20, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey={nameKey} width={110} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey={dataKey} fill={PALETTE[0]} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** A simple share-of-total donut — used where "which slice is biggest" matters more than exact trend (e.g. revenue split). */
function SplitDonut({ slices }) {
  const data = slices.filter((s) => Number(s.value) > 0);
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => money(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function Table({ columns, rows, empty }) {
  if (rows === null) return <p className="px-3 py-6 text-center text-sm text-slate-400">Loading…</p>;
  if (!rows.length) return <p className="px-3 py-6 text-center text-sm text-slate-400">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>{columns.map((c) => <th key={c.key} className="px-3 py-2">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key ?? r.date ?? i} className="border-b border-slate-100 last:border-0">
              {columns.map((c) => <td key={c.key} className="px-3 py-2">{c.render ? c.render(r) : (r[c.key] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RangePicker({ range, setRange, from, to, setFrom, setTo, onApply }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => setRange(r.key)}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            range === r.key ? "border-[var(--hms-btn-bg)] bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "border-slate-300 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {r.label}
        </button>
      ))}
      {range === "custom" && (
        <>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </>
      )}
      <button onClick={onApply} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)]">
        Apply
      </button>
    </div>
  );
}

function useDomainData(endpoint, range, from, to, reloadKey) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setData(null);
      setErr("");
      const params = new URLSearchParams({ range });
      if (range === "custom" && from && to) {
        params.set("from", from);
        params.set("to", to);
      }
      try {
        const res = await apiGet(`${endpoint}?${params.toString()}`);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      }
    }
    load();

    return () => {
      cancelled = true;
    };
  }, [endpoint, range, from, to, reloadKey]);

  return { data, err };
}

const DOMAINS = [
  { key: "operations", label: "Hospital Operations" },
  { key: "clinical", label: "Clinical" },
  { key: "pharmacy", label: "Pharmacy" },
  { key: "lab", label: "Lab" },
  { key: "radiology", label: "Radiology" },
  { key: "billing", label: "Billing / Finance" },
  { key: "staff", label: "Staff / HR" },
  { key: "patient", label: "Patient" },
];

export default function AnalyticsClient({ tenantType }) {
  const [domain, setDomain] = useState("operations");
  const [range, setRange] = useState("30d");
  const [from, setFrom] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reloadKey, setReloadKey] = useState(0);

  const domains = useMemo(() => (tenantType === "HOSPITAL" ? DOMAINS : DOMAINS.filter((d) => d.key !== "staff")), [tenantType]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pre-aggregated daily rollups — refreshed automatically every few minutes, never a live scan of your
          operational data.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {domains.map((d) => (
          <button
            key={d.key}
            onClick={() => setDomain(d.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              domain === d.key ? "border-[var(--hms-btn-bg)] bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <RangePicker range={range} setRange={setRange} from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={() => setReloadKey((k) => k + 1)} />

      {domain === "operations" && <OperationsPanel range={range} from={from} to={to} reloadKey={reloadKey} />}
      {domain === "clinical" && <ClinicalPanel range={range} from={from} to={to} reloadKey={reloadKey} />}
      {domain === "pharmacy" && <PharmacyPanel range={range} from={from} to={to} reloadKey={reloadKey} />}
      {domain === "lab" && <LabPanel range={range} from={from} to={to} reloadKey={reloadKey} />}
      {domain === "radiology" && <RadiologyPanel range={range} from={from} to={to} reloadKey={reloadKey} />}
      {domain === "billing" && <BillingPanel range={range} from={from} to={to} reloadKey={reloadKey} />}
      {domain === "staff" && <StaffPanel range={range} from={from} to={to} reloadKey={reloadKey} />}
      {domain === "patient" && <PatientPanel range={range} from={from} to={to} reloadKey={reloadKey} />}
    </div>
  );
}

function ErrBox({ err }) {
  if (!err) return null;
  return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>;
}

function OperationsPanel({ range, from, to, reloadKey }) {
  const { data, err } = useDomainData("/api/analytics/operations", range, from, to, reloadKey);
  return (
    <div className="space-y-4">
      <ErrBox err={err} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="New patients" value={num(data.totals.patients_new)} />
            <Card label="Returning patients" value={num(data.totals.patients_returning)} />
            <Card label="OPD visits" value={num(data.totals.opd_visits)} />
            <Card label="Admissions" value={num(data.totals.admissions)} />
            <Card label="Discharges" value={num(data.totals.discharges)} />
            <Card label="Bed occupancy" value={`${data.occupancyPct}%`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Patients & visits, day by day" empty={data.daily.length ? undefined : "No data in this range."}>
              <TrendChart
                daily={data.daily}
                series={[
                  { key: "patients_new", label: "New patients" },
                  { key: "opd_visits", label: "OPD visits" },
                  { key: "admissions", label: "Admissions" },
                ]}
              />
            </ChartCard>
            <ChartCard title="Beds by ward" empty={data.wardBreakdown.length ? undefined : "No ward data."}>
              <BreakdownBarChart rows={data.wardBreakdown} />
            </ChartCard>
          </div>
          <Table
            columns={[
              { key: "label", label: "Ward" },
              { key: "count", label: "Beds", render: (r) => num(r.count) },
              { key: "secondary", label: "Occupied", render: (r) => num(r.secondary) },
            ]}
            rows={data.wardBreakdown}
            empty="No ward data."
          />
        </>
      )}
    </div>
  );
}

function ClinicalPanel({ range, from, to, reloadKey }) {
  const { data, err } = useDomainData("/api/analytics/clinical", range, from, to, reloadKey);
  return (
    <div className="space-y-4">
      <ErrBox err={err} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="Consultations" value={num(data.totals.consultations)} />
            <Card label="Prescriptions" value={num(data.totals.prescriptions_created)} />
            <Card label="Appointments booked" value={num(data.totals.appointments_booked)} />
            <Card label="No-shows" value={num(data.totals.appointments_noshow)} tone="warn" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Consultations & prescriptions, day by day" empty={data.daily.length ? undefined : "No data in this range."}>
              <TrendChart
                daily={data.daily}
                series={[
                  { key: "consultations", label: "Consultations" },
                  { key: "prescriptions_created", label: "Prescriptions" },
                ]}
              />
            </ChartCard>
            <ChartCard title="Top doctors by consultations" empty={data.doctorWorkload.length ? undefined : "No consultations in this range."}>
              <BreakdownBarChart rows={data.doctorWorkload} />
            </ChartCard>
          </div>
          <Table
            columns={[
              { key: "label", label: "Doctor" },
              { key: "count", label: "Consultations", render: (r) => num(r.count) },
              { key: "value", label: "Revenue", render: (r) => money(r.value) },
            ]}
            rows={data.doctorWorkload}
            empty="No consultations in this range."
          />
        </>
      )}
    </div>
  );
}

function PharmacyPanel({ range, from, to, reloadKey }) {
  const { data, err } = useDomainData("/api/analytics/pharmacy", range, from, to, reloadKey);
  return (
    <div className="space-y-4">
      <ErrBox err={err} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="Items dispensed" value={num(data.totals.pharmacy_items_dispensed)} />
            <Card label="Dispensed value" value={money(data.totals.pharmacy_dispensed_value)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Items dispensed, day by day" empty={data.daily.length ? undefined : "No data in this range."}>
              <TrendChart daily={data.daily} series={[{ key: "pharmacy_items_dispensed", label: "Items dispensed" }]} kind="bar" />
            </ChartCard>
            <ChartCard title="Top medicines dispensed" empty={data.topMedicines.length ? undefined : "No dispensing in this range."}>
              <BreakdownBarChart rows={data.topMedicines} />
            </ChartCard>
          </div>
          <Table
            columns={[
              { key: "label", label: "Medicine" },
              { key: "count", label: "Qty dispensed", render: (r) => num(r.count) },
            ]}
            rows={data.topMedicines}
            empty="No dispensing in this range."
          />
        </>
      )}
    </div>
  );
}

function LabPanel({ range, from, to, reloadKey }) {
  const { data, err } = useDomainData("/api/analytics/lab", range, from, to, reloadKey);
  return (
    <div className="space-y-4">
      <ErrBox err={err} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="Orders created" value={num(data.totals.lab_orders_created)} />
            <Card label="Orders completed" value={num(data.totals.lab_orders_completed)} />
            <Card label="Lab revenue" value={money(data.totals.lab_revenue)} />
            <Card label="Avg turnaround" value={data.avgTurnaroundHours != null ? `${Number(data.avgTurnaroundHours).toFixed(1)} hrs` : "—"} />
          </div>
          <ChartCard title="Lab orders, day by day" empty={data.daily.length ? undefined : "No data in this range."}>
            <TrendChart
              daily={data.daily}
              series={[
                { key: "lab_orders_created", label: "Orders created" },
                { key: "lab_orders_completed", label: "Orders completed" },
              ]}
            />
          </ChartCard>
        </>
      )}
    </div>
  );
}

function RadiologyPanel({ range, from, to, reloadKey }) {
  const { data, err } = useDomainData("/api/analytics/radiology", range, from, to, reloadKey);
  return (
    <div className="space-y-4">
      <ErrBox err={err} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="Orders created" value={num(data.totals.radiology_orders_created)} />
            <Card label="Orders completed" value={num(data.totals.radiology_orders_completed)} />
            <Card label="Radiology revenue" value={money(data.totals.radiology_revenue)} />
            <Card label="Avg turnaround" value={data.avgTurnaroundHours != null ? `${Number(data.avgTurnaroundHours).toFixed(1)} hrs` : "—"} />
          </div>
          <ChartCard title="Radiology orders, day by day" empty={data.daily.length ? undefined : "No data in this range."}>
            <TrendChart
              daily={data.daily}
              series={[
                { key: "radiology_orders_created", label: "Orders created" },
                { key: "radiology_orders_completed", label: "Orders completed" },
              ]}
            />
          </ChartCard>
        </>
      )}
    </div>
  );
}

function BillingPanel({ range, from, to, reloadKey }) {
  const { data, err } = useDomainData("/api/analytics/billing", range, from, to, reloadKey);
  return (
    <div className="space-y-4">
      <ErrBox err={err} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="Billed (total)" value={money(data.totals.revenue_total)} />
            <Card label="Collections" value={money(data.totals.collections_total)} />
            <Card label="Refunds" value={money(data.totals.refunds_total)} tone="warn" />
            <Card label="Discounts" value={money(data.totals.discounts_total)} tone="warn" />
            <Card label="Tax" value={money(data.totals.tax_total)} />
            <Card label="OPD revenue" value={money(data.totals.opd_revenue)} />
            <Card label="IPD revenue" value={money(data.totals.ipd_revenue)} />
            <Card label="Outstanding (as of latest)" value={money(data.outstandingEod)} tone="danger" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Billed vs collected, day by day" empty={data.daily.length ? undefined : "No data in this range."}>
              <TrendChart
                daily={data.daily}
                series={[
                  { key: "revenue_total", label: "Billed" },
                  { key: "collections_total", label: "Collected" },
                ]}
              />
            </ChartCard>
            <ChartCard title="OPD vs IPD revenue" empty={Number(data.totals.opd_revenue) + Number(data.totals.ipd_revenue) > 0 ? undefined : "No revenue in this range."}>
              <SplitDonut
                slices={[
                  { name: "OPD", value: Number(data.totals.opd_revenue) },
                  { name: "IPD", value: Number(data.totals.ipd_revenue) },
                ]}
              />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

function StaffPanel({ range, from, to, reloadKey }) {
  const { data, err } = useDomainData("/api/analytics/staff", range, from, to, reloadKey);
  return (
    <div className="space-y-4">
      <ErrBox err={err} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="Staff present (sum of days)" value={num(data.totals.staff_present_count)} />
            <Card label="On approved leave (sum of days)" value={num(data.totals.staff_on_leave_count)} />
          </div>
          <ChartCard title="Attendance vs leave, day by day" empty={data.daily.length ? undefined : "No data in this range."}>
            <TrendChart
              daily={data.daily}
              series={[
                { key: "staff_present_count", label: "Present" },
                { key: "staff_on_leave_count", label: "On leave" },
              ]}
              kind="bar"
            />
          </ChartCard>
        </>
      )}
    </div>
  );
}

function PatientPanel({ range, from, to, reloadKey }) {
  const { data, err } = useDomainData("/api/analytics/patient", range, from, to, reloadKey);
  return (
    <div className="space-y-4">
      <ErrBox err={err} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card label="New patients" value={num(data.totals.patients_new)} />
            <Card label="Returning patients" value={num(data.totals.patients_returning)} />
          </div>
          <ChartCard title="New vs returning, day by day" empty={data.daily.length ? undefined : "No data in this range."}>
            <TrendChart
              daily={data.daily}
              series={[
                { key: "patients_new", label: "New" },
                { key: "patients_returning", label: "Returning" },
              ]}
            />
          </ChartCard>
        </>
      )}
    </div>
  );
}
