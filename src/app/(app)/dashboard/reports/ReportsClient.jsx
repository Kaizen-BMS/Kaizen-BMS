"use client";

import { fmtDDMMYY } from "@/lib/dateFormat";

import { useEffect, useState } from "react";
import { apiGet } from "@/components/hms/api";

// Core revenue/collection reports (CLAUDE.md "Reports" — Phase 7).
// Deliberately practical, not a BI platform: one tabbed page, a shared
// date-range filter, summary cards + tables. No report-builder, no export
// beyond what's trivially in scope.

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }) : v ?? "—";
}

function SummaryCard({ label, value, tone }) {
  const toneClass = tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function Table({ columns, rows, empty }) {
  if (rows === null) return <p className="px-3 py-6 text-center text-sm text-slate-400">Loading…</p>;
  if (rows.length === 0) return <p className="px-3 py-6 text-center text-sm text-slate-400">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>{columns.map((c) => <th key={c.key} className="px-3 py-2">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? r.billId ?? i} className="border-b border-slate-100 last:border-0">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2">{c.render ? c.render(r) : (r[c.key] ?? "—")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DateFilter({ from, to, setFrom, setTo, onApply, children }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs text-slate-500">From</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-slate-500">To</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      {children}
      <button onClick={onApply} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)]">
        Apply
      </button>
    </div>
  );
}

const TABS = [
  { key: "collection", label: "Daily Collection" },
  { key: "outstanding", label: "Outstanding" },
  { key: "opd", label: "OPD Revenue" },
  { key: "ipd", label: "IPD Revenue" },
  { key: "lab", label: "Lab Revenue" },
  { key: "radiology", label: "Radiology Revenue" },
  { key: "pharmacy", label: "Pharmacy Sales" },
  { key: "doctor", label: "Doctor Revenue" },
];

export default function ReportsClient() {
  const [tab, setTab] = useState("collection");
  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Collections, outstanding balances, and revenue by department — drawn from real bills, payments and
          refunds, never estimated.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              tab === t.key
                ? "border-[var(--hms-btn-bg)] bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "collection" && <CollectionTab />}
      {tab === "outstanding" && <OutstandingTab />}
      {tab === "opd" && <RevenueTab endpoint="/api/reports/opd" columns={OPD_COLUMNS} empty="No OPD revenue in this range." />}
      {tab === "ipd" && <IpdTab />}
      {tab === "lab" && <RevenueTab endpoint="/api/reports/lab" columns={LAB_COLUMNS} empty="No lab revenue in this range." />}
      {tab === "radiology" && <RevenueTab endpoint="/api/reports/radiology" columns={LAB_COLUMNS} empty="No radiology revenue in this range." />}
      {tab === "pharmacy" && <RevenueTab endpoint="/api/reports/pharmacy" columns={PHARMACY_COLUMNS} empty="No pharmacy revenue in this range." />}
      {tab === "doctor" && <RevenueTab endpoint="/api/reports/doctor-revenue" columns={DOCTOR_COLUMNS} empty="No attributable doctor revenue in this range." />}
    </div>
  );
}

function CollectionTab() {
  const [from, setFrom] = useState(todayStr(-6));
  const [to, setTo] = useState(todayStr());
  const [mode, setMode] = useState("");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    setData(null);
    setErr("");
    try {
      const params = new URLSearchParams({ from, to });
      if (mode) params.set("mode", mode);
      const res = await apiGet(`/api/reports/collection?${params.toString()}`);
      setData(res);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <DateFilter from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={load}>
        <div>
          <label className="block text-xs text-slate-500">Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">All</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="UPI">UPI</option>
          </select>
        </div>
      </DateFilter>
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Total collected" value={money(data.totalCollected)} />
            <SummaryCard label="Bills with payments" value={data.billsCount} />
            <SummaryCard label="Refunds" value={money(data.totalRefunded)} tone="warn" />
            <SummaryCard
              label="Net collection"
              value={money(Number(data.totalCollected) - Number(data.totalRefunded))}
            />
          </div>
          <Table
            columns={[
              { key: "mode", label: "Payment mode" },
              { key: "total", label: "Total", render: (r) => money(r.total) },
              { key: "count", label: "Count", render: (r) => Number(r.count) },
            ]}
            rows={data.byMode}
            empty="No payments recorded in this range."
          />
        </>
      )}
    </div>
  );
}

function OutstandingTab() {
  const [rows, setRows] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  async function load(p) {
    setRows(null);
    const res = await apiGet(`/api/reports/outstanding?page=${p}&pageSize=25`);
    setRows(res.bills);
    setTotal(res.total);
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load(page);
  }, [page]);

  return (
    <div className="space-y-4">
      <Table
        columns={[
          { key: "id", label: "Bill #" },
          { key: "billType", label: "Type" },
          { key: "patientName", label: "Patient" },
          { key: "createdAt", label: "Date", render: (r) => fmtDDMMYY(r.createdAt) },
          { key: "total", label: "Total", render: (r) => money(r.total) },
          { key: "paid", label: "Paid", render: (r) => money(r.paid) },
          { key: "refunded", label: "Refunded", render: (r) => money(r.refunded) },
          { key: "outstanding", label: "Outstanding", render: (r) => money(r.outstanding) },
          { key: "status", label: "Status" },
        ]}
        rows={rows}
        empty="No outstanding bills — everything's settled."
      />
      {total > 25 && (
        <div className="flex items-center gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40">
            Prev
          </button>
          <span className="text-slate-500">Page {page} of {Math.ceil(total / 25)}</span>
          <button disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}

const OPD_COLUMNS = [
  { key: "date", label: "Date", render: (r) => fmtDDMMYY(r.date) },
  { key: "service", label: "Service" },
  { key: "doctorName", label: "Doctor", render: (r) => r.doctorName || "—" },
  { key: "quantity", label: "Qty" },
  { key: "revenue", label: "Revenue", render: (r) => money(r.revenue) },
];

const LAB_COLUMNS = [
  { key: "serviceName", label: "Test / Service" },
  { key: "quantity", label: "Qty" },
  { key: "billed", label: "Billed", render: (r) => money(r.billed) },
];

const PHARMACY_COLUMNS = [
  { key: "line", label: "Item" },
  { key: "moduleInstance", label: "Pharmacy instance", render: (r) => r.moduleInstance || "—" },
  { key: "quantity", label: "Qty" },
  { key: "billed", label: "Billed", render: (r) => money(r.billed) },
];

const DOCTOR_COLUMNS = [
  { key: "doctorName", label: "Doctor" },
  { key: "service", label: "Service" },
  { key: "line_count", label: "Lines", render: (r) => Number(r.line_count) },
  { key: "revenue", label: "Revenue", render: (r) => money(r.revenue) },
];

function RevenueTab({ endpoint, columns, empty }) {
  const [from, setFrom] = useState(todayStr(-29));
  const [to, setTo] = useState(todayStr());
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    setRows(null);
    setErr("");
    try {
      const res = await apiGet(`${endpoint}?from=${from}&to=${to}`);
      setRows(res.rows);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <DateFilter from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={load} />
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <Table columns={columns} rows={rows} empty={empty} />
    </div>
  );
}

function IpdTab() {
  const [from, setFrom] = useState(todayStr(-29));
  const [to, setTo] = useState(todayStr());
  const [rows, setRows] = useState(null);

  async function load() {
    setRows(null);
    const res = await apiGet(`/api/reports/ipd?from=${from}&to=${to}`);
    setRows(res.rows);
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <DateFilter from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={load} />
      <Table
        columns={[
          { key: "billId", label: "Bill #" },
          { key: "patientName", label: "Patient" },
          { key: "status", label: "Status" },
          { key: "billed", label: "Billed", render: (r) => money(r.billed) },
          { key: "collected", label: "Collected", render: (r) => money(r.collected) },
          { key: "outstanding", label: "Outstanding", render: (r) => money(r.outstanding) },
        ]}
        rows={rows}
        empty="No IPD bills in this range."
      />
    </div>
  );
}
