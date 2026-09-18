"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/components/hms/api";

// Analytics + Rollup System UI (this task's "D"). Reads exclusively from
// the pre-aggregated analytics_daily_tenant/dimension tables via
// GET /api/analytics/<domain> — never a live full-table scan from the
// browser's perspective. Same "plain, fast, functional" dashboard style as
// Reports (ReportsClient.jsx) — summary cards + tables, no charting
// library, no report-builder.

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "12mo", label: "12 months" },
  { key: "custom", label: "Custom" },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : "—";
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }) : "—";
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="Orders created" value={num(data.totals.lab_orders_created)} />
          <Card label="Orders completed" value={num(data.totals.lab_orders_completed)} />
          <Card label="Lab revenue" value={money(data.totals.lab_revenue)} />
          <Card label="Avg turnaround" value={data.avgTurnaroundHours != null ? `${Number(data.avgTurnaroundHours).toFixed(1)} hrs` : "—"} />
        </div>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="Orders created" value={num(data.totals.radiology_orders_created)} />
          <Card label="Orders completed" value={num(data.totals.radiology_orders_completed)} />
          <Card label="Radiology revenue" value={money(data.totals.radiology_revenue)} />
          <Card label="Avg turnaround" value={data.avgTurnaroundHours != null ? `${Number(data.avgTurnaroundHours).toFixed(1)} hrs` : "—"} />
        </div>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="Staff present (sum of days)" value={num(data.totals.staff_present_count)} />
          <Card label="On approved leave (sum of days)" value={num(data.totals.staff_on_leave_count)} />
        </div>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="New patients" value={num(data.totals.patients_new)} />
          <Card label="Returning patients" value={num(data.totals.patients_returning)} />
        </div>
      )}
    </div>
  );
}
