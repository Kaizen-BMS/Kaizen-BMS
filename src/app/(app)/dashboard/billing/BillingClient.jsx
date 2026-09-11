"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";

const STATUS_STYLE = {
  OPEN: "bg-slate-100 text-slate-600",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
  REFUNDED: "bg-red-100 text-red-700",
};

export default function BillingClient({ permissions }) {
  const [bills, setBills] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState("");
  const [newVisitId, setNewVisitId] = useState("");
  const [flashIds, setFlashIds] = useState(new Set());

  function flash(id) {
    setFlashIds((s) => new Set(s).add(id));
    setTimeout(() => setFlashIds((s) => { const n = new Set(s); n.delete(id); return n; }), 2000);
  }

  async function loadList() {
    const { bills } = await apiGet("/api/billing");
    setBills(bills);
  }
  async function loadDetail(id) {
    const { bill } = await apiGet(`/api/billing/${id}`);
    setDetail(bill);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime(
    {
      "bill:created": ({ bill }) => { flash(bill.id); loadList(); },
      "bill:updated": ({ bill }) => {
        flash(bill.id);
        loadList();
        if (openId && Number(bill.id) === Number(openId)) loadDetail(openId);
      },
      "bill:paid": ({ bill }) => {
        flash(bill.id);
        loadList();
        if (openId && Number(bill.id) === Number(openId)) loadDetail(openId);
      },
    },
    loadList,
  );

  async function createOpdBill(e) {
    e.preventDefault();
    try {
      const { bill } = await apiSend("/api/billing/opd", "POST", { visitId: Number(newVisitId) });
      setNewVisitId("");
      await loadList();
      openBill(bill.id);
    } catch (err) {
      setMsg(err.message);
    }
  }

  function openBill(id) {
    setOpenId(id);
    loadDetail(id).catch((e) => setMsg(e.message));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Billing</h1>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      {permissions.canCreate && (
        <form onSubmit={createOpdBill} className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <div>
            <p className="text-sm font-semibold">Create OPD bill</p>
            <p className="text-xs text-slate-500">Aggregates consultation fee + dispensed pharmacy + lab tests for a visit.</p>
          </div>
          <input
            placeholder="visit id"
            required
            value={newVisitId}
            onChange={(e) => setNewVisitId(e.target.value)}
            className="ml-auto w-28 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Create</button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {bills.length === 0 && <p className="text-sm text-slate-400">No bills yet.</p>}
          {bills.map((b) => (
            <button
              key={b.id}
              onClick={() => openBill(b.id)}
              className={`block w-full rounded-lg border p-3 text-left ${
                openId === b.id ? "border-slate-900" : "border-slate-200"
              } bg-white ${flashIds.has(b.id) ? "hms-flash" : ""}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {b.patient_name} <span className="text-xs font-normal text-slate-400">#{b.id} · {b.bill_type}</span>
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[b.status] || ""}`}>
                  {b.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">₹{Number(b.total_amount).toFixed(2)}</p>
            </button>
          ))}
        </div>

        <div>
          {detail ? (
            <BillDetail bill={detail} canUpdate={permissions.canUpdate} onChanged={() => { loadDetail(openId); loadList(); }} onError={setMsg} />
          ) : (
            <p className="text-sm text-slate-400">Select a bill.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BillDetail({ bill, canUpdate, onChanged, onError }) {
  const [priceEdits, setPriceEdits] = useState({});
  const [payment, setPayment] = useState({ amount: "", mode: "CASH" });
  const [discount, setDiscount] = useState({ amount: "", reason: "" });
  const [refund, setRefund] = useState({ amount: "", reason: "" });

  // Stable per-attempt key: a manual retry after a failed/timed-out submit
  // reuses the same key (so the server recognizes it and returns the
  // existing row instead of double-recording); a fresh key is drawn only
  // after a submission actually succeeds. See CLAUDE.md "Billing module".
  const paymentKeyRef = useRef(crypto.randomUUID());
  const discountKeyRef = useRef(crypto.randomUUID());
  const refundKeyRef = useRef(crypto.randomUUID());

  const itemsTotal = bill.bill_items.reduce((s, i) => s + Number(i.amount), 0);
  const discountTotal = bill.discounts.reduce((s, d) => s + Number(d.amount), 0);
  const paidTotal = bill.payments.reduce((s, p) => s + Number(p.amount), 0);
  const refundTotal = bill.refunds.reduce((s, r) => s + Number(r.amount), 0);
  const balance = Math.max(itemsTotal - discountTotal - (paidTotal - refundTotal), 0);

  async function savePrice(itemId) {
    try {
      await apiSend(`/api/billing/${bill.id}/items/${itemId}`, "PATCH", { amount: Number(priceEdits[itemId]) });
    } catch (err) {
      onError(err.message);
    }
  }

  async function recordPayment(e) {
    e.preventDefault();
    try {
      await apiSend(`/api/billing/${bill.id}/payments`, "POST", {
        amount: Number(payment.amount),
        mode: payment.mode,
        idempotencyKey: paymentKeyRef.current,
      });
      paymentKeyRef.current = crypto.randomUUID();
      setPayment({ amount: "", mode: "CASH" });
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  async function recordDiscount(e) {
    e.preventDefault();
    try {
      await apiSend(`/api/billing/${bill.id}/discounts`, "POST", {
        ...discount,
        idempotencyKey: discountKeyRef.current,
      });
      discountKeyRef.current = crypto.randomUUID();
      setDiscount({ amount: "", reason: "" });
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  async function recordRefund(e) {
    e.preventDefault();
    try {
      await apiSend(`/api/billing/${bill.id}/refunds`, "POST", {
        ...refund,
        idempotencyKey: refundKeyRef.current,
      });
      refundKeyRef.current = crypto.randomUUID();
      setRefund({ amount: "", reason: "" });
      onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {bill.patient_name} <span className="text-xs font-normal text-slate-400">#{bill.id}</span>
        </p>
        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[bill.status] || ""}`}>
          {bill.status.replace(/_/g, " ")}
        </span>
      </div>

      <table className="w-full text-xs">
        <tbody>
          {bill.bill_items.map((it) => (
            <tr key={it.id} className="border-t border-slate-100">
              <td className="py-1.5 pr-2">
                {it.description} <span className="text-slate-400">({it.source})</span>
              </td>
              <td className="py-1.5 text-right">
                {canUpdate && !bill.finalized_at ? (
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={String(it.amount)}
                      value={priceEdits[it.id] ?? ""}
                      onChange={(e) => setPriceEdits((s) => ({ ...s, [it.id]: e.target.value }))}
                      className="w-20 rounded border border-slate-300 px-1 py-0.5"
                    />
                    <button
                      onClick={() => savePrice(it.id)}
                      disabled={priceEdits[it.id] === undefined || priceEdits[it.id] === ""}
                      className="rounded bg-slate-900 px-2 py-0.5 text-white disabled:opacity-50"
                    >
                      save
                    </button>
                  </div>
                ) : (
                  <span>₹{Number(it.amount).toFixed(2)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-1 border-t border-slate-200 pt-2 text-xs">
        <div className="flex justify-between"><span>Items total</span><span>₹{itemsTotal.toFixed(2)}</span></div>
        {discountTotal > 0 && <div className="flex justify-between text-amber-700"><span>Discounts</span><span>-₹{discountTotal.toFixed(2)}</span></div>}
        {paidTotal > 0 && <div className="flex justify-between text-green-700"><span>Paid</span><span>₹{paidTotal.toFixed(2)}</span></div>}
        {refundTotal > 0 && <div className="flex justify-between text-red-700"><span>Refunded</span><span>-₹{refundTotal.toFixed(2)}</span></div>}
        <div className="flex justify-between font-semibold"><span>Balance due</span><span>₹{balance.toFixed(2)}</span></div>
      </div>

      {canUpdate && balance > 0 && (
        <form onSubmit={recordPayment} className="flex items-end gap-2 border-t border-slate-100 pt-2">
          <input type="number" min="0.01" step="0.01" required placeholder="amount" value={payment.amount}
            onChange={(e) => setPayment((s) => ({ ...s, amount: e.target.value }))}
            className="w-24 rounded border border-slate-300 px-2 py-1 text-xs" />
          <select value={payment.mode} onChange={(e) => setPayment((s) => ({ ...s, mode: e.target.value }))}
            className="rounded border border-slate-300 px-2 py-1 text-xs">
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="UPI">UPI</option>
          </select>
          <button className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white">Record payment</button>
        </form>
      )}

      {canUpdate && (
        <details className="border-t border-slate-100 pt-2 text-xs">
          <summary className="cursor-pointer text-slate-500">Discount / refund</summary>
          <form onSubmit={recordDiscount} className="mt-2 flex items-end gap-2">
            <input type="number" min="0.01" step="0.01" required placeholder="discount amount" value={discount.amount}
              onChange={(e) => setDiscount((s) => ({ ...s, amount: e.target.value }))}
              className="w-28 rounded border border-slate-300 px-2 py-1" />
            <input required placeholder="reason (required)" value={discount.reason}
              onChange={(e) => setDiscount((s) => ({ ...s, reason: e.target.value }))}
              className="flex-1 rounded border border-slate-300 px-2 py-1" />
            <button className="rounded bg-slate-700 px-3 py-1 font-medium text-white">Apply discount</button>
          </form>
          {paidTotal > 0 && (
            <form onSubmit={recordRefund} className="mt-2 flex items-end gap-2">
              <input type="number" min="0.01" step="0.01" required placeholder="refund amount" value={refund.amount}
                onChange={(e) => setRefund((s) => ({ ...s, amount: e.target.value }))}
                className="w-28 rounded border border-slate-300 px-2 py-1" />
              <input required placeholder="reason (required)" value={refund.reason}
                onChange={(e) => setRefund((s) => ({ ...s, reason: e.target.value }))}
                className="flex-1 rounded border border-slate-300 px-2 py-1" />
              <button className="rounded bg-red-700 px-3 py-1 font-medium text-white">Record refund</button>
            </form>
          )}
        </details>
      )}

      <a
        href={`/print/receipt/${bill.id}`}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-xs text-slate-500 underline"
      >
        Print receipt
      </a>
    </div>
  );
}
