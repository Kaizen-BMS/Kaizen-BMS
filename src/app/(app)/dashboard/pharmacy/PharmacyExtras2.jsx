"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import { fmtDDMMYY } from "@/lib/dateFormat";
import { PharmacyPayBox } from "./PharmacyExtras";

const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
const rupee = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const STATUS_STYLE = {
  DRAFT: "bg-slate-100 text-slate-600", SENT: "bg-blue-100 text-blue-700", PARTIALLY_RECEIVED: "bg-amber-100 text-amber-700",
  RECEIVED: "bg-emerald-100 text-emerald-700", CANCELLED: "bg-red-100 text-red-700",
};

// ── Purchase Orders — the step BEFORE stock physically arrives ─────
export function PurchaseOrdersTab({ canManage, onError, onReceive }) {
  const emptyLine = { medicineId: "", quantity: "", freeQuantity: "0", purchaseRate: "", gstRate: "0" };
  const [pos, setPos] = useState(null);
  const [meds, setMeds] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [head, setHead] = useState({ supplierId: "", poDate: new Date().toISOString().slice(0, 10), expectedDeliveryDate: "", notes: "" });
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => apiGet("/api/pharmacy/purchase-orders").then((d) => setPos(d.purchaseOrders));
  useEffect(() => {
    apiGet("/api/pharmacy/medicines?active=true").then((d) => setMeds(d.medicines)).catch(() => {});
    apiGet("/api/pharmacy/suppliers").then((d) => setSuppliers(d.suppliers)).catch(() => {});
    load().catch((e) => setMsg(e.message));
  }, []);
  useRealtime({ "po:updated": load }, load);

  const setLine = (i, patch) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const items = lines.filter((l) => l.medicineId && l.quantity).map((l) => ({
        medicineId: Number(l.medicineId), quantity: Number(l.quantity), freeQuantity: Number(l.freeQuantity || 0),
        purchaseRate: Number(l.purchaseRate || 0), gstRate: Number(l.gstRate || 0),
      }));
      if (!items.length) throw new Error("no_items");
      await apiSend("/api/pharmacy/purchase-orders", "POST", { ...head, ...(head.supplierId ? { supplierId: Number(head.supplierId) } : {}), items });
      setLines([{ ...emptyLine }]);
      setShowForm(false);
      await load();
    } catch (err) {
      onError(err.message === "no_items" ? "Add at least one line (medicine + quantity)." : `Could not create (${err.message}).`);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(po) {
    if (!confirm(`Cancel ${po.poNumber}?`)) return;
    try {
      await apiSend(`/api/pharmacy/purchase-orders/${po.id}`, "PATCH", { status: "CANCELLED" });
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  if (!pos) return <p className="text-sm text-slate-400">{msg || "Loading…"}</p>;
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <button onClick={() => setShowForm((v) => !v)} className="text-sm font-semibold">{showForm ? "▾" : "▸"} Create a purchase order</button>
          {showForm && (
            <form onSubmit={submit} className="mt-3 space-y-3">
              <div className="grid gap-2 sm:grid-cols-4">
                <select value={head.supplierId} onChange={(e) => setHead({ ...head, supplierId: e.target.value })} className={input}>
                  <option value="">— supplier —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <label className="text-xs"><span className="block text-slate-500">PO date</span><input required type="date" value={head.poDate} onChange={(e) => setHead({ ...head, poDate: e.target.value })} className={`${input} w-full`} /></label>
                <label className="text-xs"><span className="block text-slate-500">Expected delivery</span><input type="date" value={head.expectedDeliveryDate} onChange={(e) => setHead({ ...head, expectedDeliveryDate: e.target.value })} className={`${input} w-full`} /></label>
                <input placeholder="Notes" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} className={input} />
              </div>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-2 gap-1.5 rounded-md border border-slate-100 bg-slate-50 p-2 sm:grid-cols-5">
                    <select value={l.medicineId} onChange={(e) => setLine(i, { medicineId: e.target.value })} className="col-span-2 rounded border border-slate-300 px-1.5 py-1 text-xs sm:col-span-1">
                      <option value="">medicine</option>
                      {meds.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <input type="number" min="0" placeholder="qty" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
                    <input type="number" min="0" placeholder="free" value={l.freeQuantity} onChange={(e) => setLine(i, { freeQuantity: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
                    <input type="number" min="0" step="0.01" placeholder="rate" value={l.purchaseRate} onChange={(e) => setLine(i, { purchaseRate: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs" />
                    <select value={l.gstRate} onChange={(e) => setLine(i, { gstRate: e.target.value })} className="rounded border border-slate-300 px-1.5 py-1 text-xs">{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</select>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setLines((xs) => [...xs, { ...emptyLine }])} className="rounded-md border border-slate-300 px-2 py-1 text-xs">+ line</button>
                  {lines.length > 1 && <button type="button" onClick={() => setLines((xs) => xs.slice(0, -1))} className="rounded-md border border-slate-300 px-2 py-1 text-xs">− remove last</button>}
                </div>
              </div>
              <button disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Send purchase order</button>
            </form>
          )}
        </div>
      )}
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">PO #</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Supplier</th><th className="px-3 py-2">Lines</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {pos.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-slate-400">No purchase orders yet.</td></tr>}
            {pos.map((po) => (
              <tr key={po.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium">{po.poNumber}</td>
                <td className="px-3 py-2">{fmtDDMMYY(po.poDate)}</td>
                <td className="px-3 py-2">{po.supplierName || "—"}</td>
                <td className="px-3 py-2 text-xs">{po.items.map((i) => `${i.medicineName} (${i.receivedQuantity}/${i.quantity})`).join(", ")}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[po.status]}`}>{po.status.replace(/_/g, " ")}</span></td>
                <td className="px-3 py-2 text-right">
                  {["SENT", "PARTIALLY_RECEIVED"].includes(po.status) && (
                    <>
                      <button onClick={() => onReceive(po)} className="mr-2 text-xs underline">Receive (GRN)</button>
                      {canManage && <button onClick={() => cancel(po)} className="text-xs text-red-600">Cancel</button>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

export function PharmacyReportsTab() {
  const [sub, setSub] = useState("inventory-summary");
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
        {REPORT_TABS.map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className={`rounded-md px-2.5 py-1 text-xs ${sub === k ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-slate-100 text-slate-600"}`}>{l}</button>
        ))}
      </div>
      {dated && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs"><span className="block text-slate-500">From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input}`} /></label>
          <label className="text-xs"><span className="block text-slate-500">To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${input}`} /></label>
          <button onClick={load} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm text-[var(--hms-btn-fg)]">Apply</button>
        </div>
      )}
      {sub === "partner-sales" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs"><span className="block text-slate-500">Date</span><input type="date" value={partnerDate} onChange={(e) => setPartnerDate(e.target.value)} className={`${input}`} /></label>
          <button onClick={load} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm text-[var(--hms-btn-fg)]">Apply</button>
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
    if (data.length === 0) return <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-400">No walk-in sales yet.</p>;
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
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
    return <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-400">No partner-connection sales on {data.date}.</p>;
  }
  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-red-600">{err}</p>}
      {data.connections.map((g) => (
        <div key={g.connectionId} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm font-semibold">{g.partnerName} <span className="font-normal text-slate-400">· {g.totalQuantity} units{g.totalAmount ? ` · ${rupee(g.totalAmount)}` : ""}</span></p>
            <button
              onClick={() => share(g.connectionId)}
              disabled={sharing === g.connectionId}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-white disabled:opacity-50"
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
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SimpleTable({ rows, cols }) {
  if (!rows || rows.length === 0) return <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-400">No data for this range.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
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
