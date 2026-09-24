"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import { fmtDDMMYY } from "@/lib/dateFormat";
import { PharmacyPayBox } from "./PharmacyExtras";
import DateInput from "@/components/hms/DateInput";
export { PurchaseOrdersTab } from "./PurchaseOrdersTab";

const input = "rounded-lg border border-slate-300 px-2 py-1.5 text-sm";
const rupee = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const STATUS_STYLE = {
  DRAFT: "bg-slate-100 text-slate-600", SENT: "bg-blue-100 text-blue-700", PARTIALLY_RECEIVED: "bg-amber-100 text-amber-700",
  RECEIVED: "bg-emerald-100 text-emerald-700", CANCELLED: "bg-red-100 text-red-700",
};

// ── Pharmacy Reports — Inventory Summary / Expiry / Purchases / GRN /
// Supplier Purchase / Dispensing / Stock Movement / Adjustments / Returns
// / Valuation / Medicine Revenue / Medicine Margin. Deliberately reached
// from inside Pharmacy itself (not the tenant-wide Reports page) so a
// solo pharmacy — which never rents the BILLING module the tenant-wide
// Reports page is gated on — can see these too.
const REPORT_TABS = [
  ["sales", "Recent Sales", false],
  ["inventory-summary", "Inventory Summary", false],
  ["valuation", "Stock Valuation", false],
  ["expiry", "Expiry", false],
  ["low-stock", "Low Stock", false],
  ["purchases", "Purchases", true],
  ["grns", "GRNs", true],
  ["supplier-purchases", "Supplier Purchases", true],
  ["dispensing", "Dispensing", true],
  ["stock-movement", "Stock Movement", true],
  ["stock-adjustments", "Stock Adjustments", true],
  ["sales-returns", "Sales Returns", true],
  ["purchase-returns", "Purchase Returns", true],
  ["medicine-revenue", "Medicine-wise Revenue", true],
  ["medicine-margin", "Medicine-wise Margin", true],
  ["partner-sales", "Partner Sales", false],
];

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function PharmacyReportsTab({ only }) {
  const tabs = only ? REPORT_TABS.filter((t) => only.includes(t[0])) : REPORT_TABS;
  const [sub, setSub] = useState(only ? only[0] : "inventory-summary");
  const [from, setFrom] = useState(todayStr(-30));
  const [to, setTo] = useState(todayStr());
  const [partnerDate, setPartnerDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const dated = REPORT_TABS.find((t) => t[0] === sub)?.[2];
  // Switching report tabs quickly can let an earlier, slower request (this
  // DB's own remote-latency variance — CLAUDE.md "Prisma") resolve AFTER a
  // later one and overwrite it with the wrong shape of data. Each call to
  // load() gets its own id (assigned when it actually RUNS, never during
  // render); a response is applied only if it's still the newest call.
  const requestIdRef = useRef(0);

  async function load() {
    const myId = ++requestIdRef.current;
    const forSub = sub;
    setErr("");
    setData(null);
    try {
      let result;
      if (forSub === "sales") {
        result = (await apiGet("/api/pharmacy/sales")).sales;
      } else if (forSub === "low-stock") {
        result = (await apiGet("/api/pharmacy/inventory")).medicines.filter((m) => m.lowStock);
      } else if (forSub === "partner-sales") {
        result = await apiGet(`/api/pharmacy/reports/partner-sales?date=${partnerDate}`);
      } else if (dated) {
        const d = await apiGet(`/api/pharmacy/reports/${forSub}?from=${from}&to=${to}`);
        result = forSub === "medicine-margin" ? d : d.rows;
      } else {
        result = await apiGet(`/api/pharmacy/reports/${forSub}`);
      }
      if (requestIdRef.current === myId) setData(result);
    } catch (e) {
      if (requestIdRef.current === myId) setErr(e.message);
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {tabs.length > 1 && tabs.map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className={`rounded-md px-2.5 py-1 text-xs ${sub === k ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-slate-100 text-slate-600"}`}>{l}</button>
        ))}
      </div>
      {dated && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs"><span className="block text-slate-500">From</span><DateInput value={from} onChange={setFrom} className={input} /></label>
          <label className="text-xs"><span className="block text-slate-500">To</span><DateInput value={to} onChange={setTo} className={input} /></label>
          <button onClick={load} className="rounded-lg bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm text-[var(--hms-btn-fg)]">Apply</button>
        </div>
      )}
      {sub === "partner-sales" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs"><span className="block text-slate-500">Date</span><DateInput value={partnerDate} onChange={setPartnerDate} className={input} /></label>
          <button onClick={load} className="rounded-lg bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm text-[var(--hms-btn-fg)]">Apply</button>
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <ReportBody sub={sub} data={data} onChanged={load} />
    </div>
  );
}

function ReportBody({ sub, data, onChanged }) {
  if (data === null) return <p className="text-sm text-slate-400">Loading…</p>;

  if (sub === "sales") {
    if (data.length === 0) return <p className="rounded-2xl border border-slate-200 bg-white shadow-sm px-3 py-6 text-center text-sm text-slate-400">No walk-in sales yet.</p>;
    return (
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">Customer</th><th className="px-3 py-2">When</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium">{s.customerName || "—"}<p className="text-xs font-normal text-slate-400">{s.phone}</p></td>
                <td className="px-3 py-2 text-xs">{fmtDDMMYY(s.createdAt)}</td>
                <td className="px-3 py-2">{rupee(s.total)}</td>
                <td className="px-3 py-2"><PharmacyPayBox billId={s.id} bill={s} onPaid={onChanged} /></td>
                <td className="px-3 py-2 text-right"><a href={`/print/receipt/${s.id}`} target="_blank" rel="noreferrer" className="text-xs underline">Print</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (sub === "inventory-summary") {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Card label="Medicines" value={data.totals.medicines} />
          <Card label="Batches" value={data.totals.batches} />
          <Card label="Stock units" value={data.totals.units} />
          <Card label="Stock value" value={rupee(data.totals.value)} />
        </div>
        <SimpleTable rows={data.byType} cols={[["type", "Type"], ["medicines", "Medicines"], ["batches", "Batches"], ["units", "Units"], ["value", "Value", rupee]]} />
      </div>
    );
  }
  if (sub === "valuation") {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card label="Stock units" value={data.totals.quantity} />
          <Card label="Cost value" value={rupee(data.totals.costValue)} />
          <Card label="MRP value" value={rupee(data.totals.mrpValue)} />
        </div>
        <SimpleTable rows={data.rows} cols={[["medicineName", "Medicine"], ["quantity", "Qty"], ["costValue", "Cost value", rupee], ["mrpValue", "MRP value", rupee]]} />
      </div>
    );
  }
  if (sub === "expiry") return <SimpleTable rows={data} cols={[["medicineName", "Medicine"], ["batchNumber", "Batch"], ["expiryDate", "Expiry", fmtDDMMYY], ["quantity", "Qty"], ["daysRemaining", "Days remaining", (v) => (v < 0 ? `Expired ${-v}d ago` : v)]]} />;
  if (sub === "low-stock") return <SimpleTable rows={data} cols={[["medicineName", "Medicine"], ["totalQuantity", "Stock"], ["threshold", "Reorder level"]]} />;
  if (sub === "purchases") return <SimpleTable rows={data} cols={[["medicineName", "Medicine"], ["quantity", "Qty"], ["value", "Value", rupee], ["grnCount", "GRNs"]]} />;
  if (sub === "grns") return <SimpleTable rows={data} cols={[["grnNumber", "GRN #"], ["grnDate", "Date", fmtDDMMYY], ["supplierName", "Supplier"], ["lineCount", "Lines"], ["acceptedQuantity", "Accepted qty"], ["value", "Value", rupee]]} />;
  if (sub === "supplier-purchases") return <SimpleTable rows={data} cols={[["supplierName", "Supplier"], ["grnCount", "GRNs"], ["quantity", "Qty"], ["value", "Value", rupee]]} />;
  if (sub === "dispensing") return <SimpleTable rows={data} cols={[["at", "When", (v) => fmtDDMMYY(v)], ["medicineName", "Medicine"], ["batchNumber", "Batch"], ["quantity", "Qty"], ["via", "Via"], ["performedBy", "By"]]} />;
  if (sub === "stock-movement") return <SimpleTable rows={data} cols={[["at", "When", fmtDDMMYY], ["type", "Type"], ["medicineName", "Medicine"], ["batchNumber", "Batch"], ["quantityDelta", "Δ Qty"], ["reason", "Reason"], ["performedBy", "By"]]} />;
  if (sub === "stock-adjustments") return <SimpleTable rows={data} cols={[["at", "When", fmtDDMMYY], ["type", "Type"], ["medicineName", "Medicine"], ["batchNumber", "Batch"], ["quantityDelta", "Δ Qty"], ["reason", "Reason"], ["performedBy", "By"]]} />;
  if (sub === "sales-returns") return <SimpleTable rows={data} cols={[["at", "When", fmtDDMMYY], ["medicineName", "Medicine"], ["batchNumber", "Batch"], ["quantity", "Qty"], ["reason", "Reason"], ["refundAmount", "Refund", rupee], ["createdBy", "By"]]} />;
  if (sub === "purchase-returns") return <SimpleTable rows={data} cols={[["at", "When", fmtDDMMYY], ["medicineName", "Medicine"], ["batchNumber", "Batch"], ["quantity", "Qty"], ["reason", "Reason"], ["supplierName", "Supplier"], ["createdBy", "By"]]} />;
  if (sub === "medicine-revenue") return <SimpleTable rows={data} cols={[["medicineName", "Medicine"], ["quantity", "Qty"], ["revenue", "Revenue", rupee]]} />;
  if (sub === "medicine-margin") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-500">{data.note}</p>
        <SimpleTable rows={data.rows} cols={[["medicineName", "Medicine"], ["quantity", "Qty"], ["revenue", "Revenue", rupee], ["cost", "Cost", rupee], ["margin", "Margin", rupee]]} />
      </div>
    );
  }
  if (sub === "partner-sales") return <PartnerSalesReport data={data} />;
  return null;
}

function PartnerSalesReport({ data }) {
  const [sharing, setSharing] = useState(null); // connectionId being shared
  const [sharedIds, setSharedIds] = useState(new Set());
  const [err, setErr] = useState("");

  async function share(connectionId) {
    setSharing(connectionId);
    setErr("");
    try {
      await apiSend("/api/pharmacy/reports/partner-sales/share", "POST", { connectionId, date: data.date });
      setSharedIds((s) => new Set(s).add(connectionId));
    } catch (e) {
      setErr(e.message);
    } finally {
      setSharing(null);
    }
  }

  if (data.connections.length === 0) {
    return <p className="rounded-2xl border border-slate-200 bg-white shadow-sm px-3 py-6 text-center text-sm text-slate-400">No partner-connection sales on {data.date}.</p>;
  }
  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-red-600">{err}</p>}
      {data.connections.map((g) => (
        <div key={g.connectionId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm font-semibold">{g.partnerName} <span className="font-normal text-slate-400">· {g.totalQuantity} units{g.totalAmount ? ` · ${rupee(g.totalAmount)}` : ""}</span></p>
            <button
              onClick={() => share(g.connectionId)}
              disabled={sharing === g.connectionId}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-white disabled:opacity-50"
            >
              {sharing === g.connectionId ? "Sending…" : sharedIds.has(g.connectionId) ? "Sent ✓ — send again" : "Share with partner"}
            </button>
          </div>
          <SimpleTable rows={g.items} cols={[["medicineName", "Medicine"], ["quantity", "Qty"], ["amount", "Amount", (v) => (v != null ? rupee(v) : "—")], ["completedAt", "When", (v) => new Date(v).toLocaleTimeString()]]} />
        </div>
      ))}
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SimpleTable({ rows, cols }) {
  if (!rows || rows.length === 0) return <p className="rounded-2xl border border-slate-200 bg-white shadow-sm px-3 py-6 text-center text-sm text-slate-400">No data for this range.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{cols.map(([k, l]) => <th key={k} className="px-3 py-2">{l}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? r.movementId ?? r.returnId ?? r.grnId ?? i} className="border-b border-slate-100 last:border-0">
              {cols.map(([k, , fmt]) => <td key={k} className="px-3 py-2">{fmt ? fmt(r[k]) : (r[k] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
