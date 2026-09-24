"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import { fmtDDMMYY } from "@/lib/dateFormat";
import MedicineInput from "@/components/hms/MedicineInput";
import DateInput from "@/components/hms/DateInput";

const input = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
const lab = "block text-xs font-medium text-slate-600";
const STATUS_STYLE = {
  DRAFT: "bg-slate-100 text-slate-600", SENT: "bg-blue-100 text-blue-700", PARTIALLY_RECEIVED: "bg-amber-100 text-amber-700",
  RECEIVED: "bg-emerald-100 text-emerald-700", CANCELLED: "bg-red-100 text-red-700",
};

const emptyLine = () => ({ quantity: "", medicineText: "", medicineId: "" });
const today = () => new Date().toISOString().slice(0, 10);

// A Purchase Order is just "what do we want, and how many, from whom".
// Prices, batches and expiry belong to Goods Received, once the stock arrives.
export function PurchaseOrdersTab({ canManage, onError, onReceive }) {
  const [pos, setPos] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [instances, setInstances] = useState([]);
  const [head, setHead] = useState({ supplierId: "", poDate: today(), expectedDeliveryDate: "", moduleInstanceId: "", notes: "" });
  const [lines, setLines] = useState([emptyLine()]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");

  const load = () => apiGet("/api/pharmacy/purchase-orders").then((d) => setPos(d.purchaseOrders));
  useEffect(() => {
    apiGet("/api/pharmacy/suppliers").then((d) => setSuppliers(d.suppliers)).catch(() => {});
    apiGet("/api/pharmacy/instances").then((d) => setInstances(d.instances.filter((i) => i.status === "ACTIVE"))).catch(() => {});
    load().catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useRealtime({ "po:updated": load }, load);

  const setLine = (i, patch) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    onError("");
    setOk("");
    try {
      const filled = lines.filter((l) => l.medicineText || l.quantity);
      if (filled.some((l) => !l.medicineId)) throw new Error("pick_medicine");
      const items = filled.filter((l) => l.quantity).map((l) => ({ medicineId: Number(l.medicineId), quantity: Number(l.quantity) }));
      if (!items.length) throw new Error("no_items");
      const { moduleInstanceId, supplierId, ...rest } = head;
      const r = await apiSend("/api/pharmacy/purchase-orders", "POST", {
        ...rest, ...(supplierId ? { supplierId: Number(supplierId) } : {}), ...(moduleInstanceId ? { moduleInstanceId: Number(moduleInstanceId) } : {}), items,
      });
      setOk(`Purchase order ${r.purchaseOrder?.poNumber || ""} created.`);
      setLines([emptyLine()]);
      setShowForm(false);
      await load();
    } catch (err) {
      onError(err.message === "no_items" ? "Add at least one medicine with a quantity." : err.message === "pick_medicine" ? "Pick each medicine from the suggestions." : `Could not create (${err.message}).`);
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

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <button onClick={() => setShowForm((v) => !v)} className="flex w-full items-center justify-between text-left text-sm font-semibold">
            <span>Create Purchase Order</span><span className="text-slate-400">{showForm ? "−" : "+"}</span>
          </button>
          {ok && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{ok}</p>}
          {showForm && (
            <form onSubmit={submit} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className={lab}>Supplier
                  <select value={head.supplierId} onChange={(e) => setHead({ ...head, supplierId: e.target.value })} className={`${input} mt-1`}>
                    <option value="">— choose supplier —</option>
                    {suppliers.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className={lab}>PO Number
                  <input disabled value="Auto (PO-0001…)" className={`${input} mt-1 bg-slate-50 text-slate-400`} />
                </label>
                <div className={lab}>PO Date
                  <DateInput value={head.poDate} onChange={(v) => setHead((h) => ({ ...h, poDate: v }))} className={`${input} mt-1`} />
                </div>
                <div className={lab}>Expected Delivery
                  <DateInput value={head.expectedDeliveryDate} onChange={(v) => setHead((h) => ({ ...h, expectedDeliveryDate: v }))} className={`${input} mt-1`} />
                </div>
                <label className={lab}>Pharmacy / Location
                  {instances.length > 1 ? (
                    <select value={head.moduleInstanceId} onChange={(e) => setHead({ ...head, moduleInstanceId: e.target.value })} className={`${input} mt-1`}>
                      <option value="">Main pharmacy</option>
                      {instances.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  ) : (
                    <input disabled value={instances[0]?.name || "Main pharmacy"} className={`${input} mt-1 bg-slate-50 text-slate-500`} />
                  )}
                </label>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[6rem_1fr] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><span>Qty</span><span>Medicine</span></div>
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[6rem_1fr] gap-2">
                    <input type="number" min="1" placeholder="100" aria-label="Quantity" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className={input} />
                    <MedicineInput value={l.medicineText} onChange={(t) => setLine(i, { medicineText: t, medicineId: "" })} onPick={(it) => setLine(i, { medicineId: String(it.id), medicineText: it.name })} placeholder="Cap Betadine 500 mg" className={input} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setLines((xs) => [...xs, emptyLine()])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">+ Add medicine</button>
                  {lines.length > 1 && <button type="button" onClick={() => setLines((xs) => xs.slice(0, -1))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50">Remove last</button>}
                </div>
              </div>
              <button disabled={busy} className="rounded-lg bg-[var(--hms-btn-bg)] px-4 py-2 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{busy ? "Sending…" : "Send purchase order"}</button>
            </form>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2.5">PO #</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Supplier</th><th className="px-3 py-2.5">Ordered</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5" /></tr>
          </thead>
          <tbody>
            {pos === null && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>}
            {pos?.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No purchase orders yet.</td></tr>}
            {pos?.map((po) => (
              <tr key={po.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium">{po.poNumber}</td>
                <td className="px-3 py-2 tabular-nums">{fmtDDMMYY(po.poDate)}</td>
                <td className="px-3 py-2">{po.supplierName || "—"}</td>
                <td className="px-3 py-2 text-xs">{po.items.map((i) => `${i.quantity} × ${i.medicineName} (received ${i.receivedQuantity})`).join(", ")}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[po.status]}`}>{po.status.replace(/_/g, " ")}</span></td>
                <td className="px-3 py-2 text-right">
                  {["SENT", "PARTIALLY_RECEIVED"].includes(po.status) && (
                    <>
                      <button onClick={() => onReceive(po)} className="mr-1 rounded-md px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100">Receive stock</button>
                      {canManage && <button onClick={() => cancel(po)} className="rounded-md px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">Cancel</button>}
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
