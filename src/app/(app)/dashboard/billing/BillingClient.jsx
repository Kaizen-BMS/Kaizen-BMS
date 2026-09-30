"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import MedicineInput from "@/components/hms/MedicineInput";
import { fmtDDMMYYTime } from "@/lib/dateFormat";

// Pharmacy's queue links here (once a prescription is fully dispensed) as
// /dashboard/billing?visitId=N — read once on mount, per Next's
// useSearchParams() requirement wrapped in its own Suspense boundary.
function VisitIdParamReader({ onReady }) {
  const params = useSearchParams();
  useEffect(() => {
    onReady(params.get("visitId"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// A partner-order dispense already creates a real bill directly (no visit
// to prefill a create-form with) — links here as /dashboard/billing?open=N
// to open that already-existing bill immediately.
function OpenBillParamReader({ onReady }) {
  const params = useSearchParams();
  useEffect(() => {
    onReady(params.get("open"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const STATUS_STYLE = {
  OPEN: "bg-slate-100 text-slate-600",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-green-100 text-green-700",
  REFUNDED: "bg-red-100 text-red-700",
};

function WalkInBill({ onCreated, onError }) {
  const [f, setF] = useState({ customerName: "", phone: "" });
  // Starts empty — a lone blank "type it yourself" row alongside the search box above was
  // confusing (which one am I supposed to use?). A line only appears once you've actually
  // picked a medicine, picked from the price list, or explicitly asked for a manual one below.
  const [items, setItems] = useState([]);
  const [medQuery, setMedQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState([]);

  // Search the pharmacy's own medicine catalog to add a line quickly — a misc/manual line here, not
  // a real dispense (that stays Pharmacy → Sales / Billing, which actually deducts batch stock).
  // Price is pre-filled from the medicine's real, current selling rate (per its smallest unit — see
  // medicineSuggest.js) so billing staff aren't retyping a number they can already see in the
  // suggestion list; it stays editable since this line isn't locked to any one batch.
  function addMedicine(m) {
    setItems((xs) => [...xs, { description: m.name, quantity: 1, unitPrice: m.sellingRate != null ? String(m.sellingRate) : "" }]);
    setMedQuery("");
  }
  useEffect(() => {
    apiGet("/api/billing/price-list").then((d) => setPrices(d.items || [])).catch(() => {});
  }, []);
  const total = items.reduce((a, i) => {
    const line = (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0);
    return a + (i.serviceId && i.taxPercent && !i.taxInclusive ? line * (1 + i.taxPercent / 100) : line);
  }, 0);
  const upd = (idx, patch) => setItems((xs) => xs.map((x, j) => (j === idx ? { ...x, ...patch } : x)));
  const removeItem = (idx) => setItems((xs) => xs.filter((_, j) => j !== idx));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { bill } = await apiSend("/api/billing/walk-in", "POST", {
        customerName: f.customerName,
        ...(f.phone ? { phone: f.phone } : {}),
        items: items
          .filter((i) => i.serviceId || i.description.trim())
          .map((i) => (i.serviceId ? { serviceId: i.serviceId, quantity: Number(i.quantity) } : { description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
      });
      setF({ customerName: "", phone: "" });
      setItems([]);
      onCreated(bill.id);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <form onSubmit={submit} className="space-y-2 rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
      <p className="text-sm font-semibold">New bill (walk-in customer)</p>
      <div className="flex flex-wrap gap-2">
        <input required placeholder="Customer name" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} className={input} />
        <input placeholder="Phone (optional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={input} />
      </div>
      {prices.length > 0 && (
        <select
          aria-label="Add from price list"
          value=""
          onChange={(e) => {
            const p = prices.find((x) => String(x.serviceId) === e.target.value);
            if (!p) return;
            const row = { description: p.name, quantity: 1, unitPrice: p.price, serviceId: p.serviceId, taxPercent: p.taxPercent, taxInclusive: p.taxInclusive };
            setItems((xs) => [...xs, row]);
          }}
          className={input}
        >
          <option value="">Add from price list…</option>
          {prices.map((p) => <option key={p.serviceId} value={p.serviceId}>{p.name} — ₹{p.price}{p.taxPercent ? ` (+${p.taxPercent}% GST)` : ""}</option>)}
        </select>
      )}
      <div>
        <MedicineInput endpoint="/api/pharmacy/medicines/suggest" value={medQuery} onChange={setMedQuery} onPick={addMedicine} placeholder="Search medicine to add a line…" className={input} />
        <p className="mt-0.5 text-[11px] text-slate-400">Adds a manual line here — price it yourself. To actually dispense against pharmacy stock, use Pharmacy → Sales / Billing instead.</p>
      </div>
      {items.length === 0 && <p className="text-xs text-slate-400">No items yet — search a medicine above, add from the price list, or add a manual line below.</p>}
      {items.map((it, idx) => (
        <div key={idx} className="flex flex-wrap items-center gap-2">
          <input placeholder="Item / medicine / test" value={it.description} readOnly={!!it.serviceId} onChange={(e) => upd(idx, { description: e.target.value })} className={`${input} min-w-[12rem] flex-1`} />
          <input type="number" min="0.01" step="any" value={it.quantity} onChange={(e) => upd(idx, { quantity: e.target.value })} className={`${input} w-20`} aria-label="Quantity" />
          <input type="number" min="0" step="any" placeholder="₹ price" value={it.unitPrice} readOnly={!!it.serviceId} onChange={(e) => upd(idx, { unitPrice: e.target.value })} className={`${input} w-28`} />
          {/* Price above is per unit and never changes with quantity — this is the line's
              actual total, shown live so it's obvious quantity IS being accounted for. */}
          {it.unitPrice !== "" && <span className="w-20 shrink-0 text-right text-sm font-medium text-slate-600">= ₹{((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)).toFixed(2)}</span>}
          <button type="button" onClick={() => removeItem(idx)} aria-label="Remove line" className="text-red-500 hover:text-red-700">✕</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setItems((xs) => [...xs, { description: "", quantity: 1, unitPrice: "" }])} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">+ item</button>
        <span className="text-sm font-medium">Total ₹{total.toFixed(2)}</span>
        <button disabled={busy || total <= 0 && !items.some((i) => i.description.trim())} className="ml-auto rounded-lg bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Create bill</button>
      </div>
    </form>
  );
}

export default function BillingClient({ permissions }) {
  const [bills, setBills] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [msg, setMsg] = useState("");
  const [newVisitId, setNewVisitId] = useState("");
  const [flashIds, setFlashIds] = useState(new Set());
  const [deepLinked, setDeepLinked] = useState(false);

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
      setDeepLinked(false);
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
      <Suspense fallback={null}>
        <VisitIdParamReader
          onReady={(visitId) => {
            if (visitId) {
              setNewVisitId(visitId);
              setDeepLinked(true);
            }
          }}
        />
      </Suspense>
      <Suspense fallback={null}>
        <OpenBillParamReader onReady={(billId) => { if (billId) openBill(Number(billId)); }} />
      </Suspense>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Billing</h1>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {deepLinked && !permissions.canCreate && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          A prescription for visit #{newVisitId} was just fully dispensed — billing staff can create its bill from here.
        </p>
      )}

      {permissions.canCreate && permissions.soloWalkIn && (
        <WalkInBill onError={setMsg} onCreated={async (id) => { await loadList(); openBill(id); }} />
      )}

      {permissions.canCreate && !permissions.soloWalkIn && (
        <form onSubmit={createOpdBill} className={`flex items-end gap-2 rounded-2xl border bg-white shadow-sm p-4 ${deepLinked ? "border-green-300 ring-1 ring-green-200" : "border-slate-200"}`}>
          <div>
            <p className="text-sm font-semibold">Create OPD bill</p>
            <p className="text-xs text-slate-500">
              {deepLinked ? "Fully dispensed — review and create this visit's bill." : "Aggregates consultation fee + dispensed pharmacy + lab tests for a visit."}
            </p>
          </div>
          <input
            placeholder="visit id"
            required
            value={newVisitId}
            onChange={(e) => { setNewVisitId(e.target.value); setDeepLinked(false); }}
            className="ml-auto w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
          <button className="rounded-lg bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">Create</button>
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
            <BillDetail key={detail.id} bill={detail} canUpdate={permissions.canUpdate} onChanged={() => { loadDetail(openId); loadList(); }} onError={setMsg} />
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
  const [addForm, setAddForm] = useState({ description: "", quantity: 1, unitPrice: "" });
  const [addBusy, setAddBusy] = useState(false);
  const input = "rounded-lg border border-slate-300 px-2 py-1.5 text-sm";

  // The same bill stays open across a patient's whole visit — they can step out and come back a
  // couple of hours later for more medicine and it lands on this one running bill, never a fresh
  // one each time (CLAUDE.md "Running / Combined Bill"). Only a finalized bill can't take more lines.
  async function addItem(e) {
    e.preventDefault();
    if (!addForm.description.trim() || addForm.unitPrice === "") return;
    setAddBusy(true);
    onError("");
    try {
      await apiSend(`/api/billing/${bill.id}/items`, "POST", {
        description: addForm.description, quantity: Number(addForm.quantity) || 1, unitPrice: Number(addForm.unitPrice), source: "PHARMACY",
      });
      setAddForm({ description: "", quantity: 1, unitPrice: "" });
      onChanged();
    } catch (err) {
      onError(err.message === "bill_finalized" ? "This bill is already finalized — start a new one." : err.message);
    } finally {
      setAddBusy(false);
    }
  }

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
      onChanged();
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
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
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
              <td className="py-1 pr-2">
                {it.description} <span className="text-slate-400">({it.source})</span>
              </td>
              <td className="py-1 text-right">
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
                      className="rounded bg-[var(--hms-btn-bg)] px-2 py-0.5 text-[var(--hms-btn-fg)] disabled:opacity-50"
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

      {canUpdate && !bill.finalized_at && (
        <form onSubmit={addItem} className="space-y-1.5 border-t border-slate-100 pt-1.5">
          <MedicineInput
            endpoint="/api/pharmacy/medicines/suggest"
            value={addForm.description}
            onChange={(t) => setAddForm((f) => ({ ...f, description: t }))}
            onPick={(m) => setAddForm((f) => ({ ...f, description: m.name, unitPrice: m.sellingRate != null ? String(m.sellingRate) : f.unitPrice }))}
            placeholder="Add another medicine to this bill…"
            className={`${input} w-full`}
          />
          <div className="flex items-center gap-2">
            {/* min/step must agree (both whole numbers) — min="0.01" with step="1" made every
                whole number the browser's own number-input validation considered "invalid"
                (Chrome's stepMismatch: valid values became 0.01, 1.01, 2.01…), silently blocking
                the field and the total that depends on it. */}
            <input type="number" min="1" step="1" value={addForm.quantity} onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value }))} aria-label="Quantity" className={`${input} w-16`} />
            <input type="number" min="0" step="0.01" placeholder="₹ price" value={addForm.unitPrice} onChange={(e) => setAddForm((f) => ({ ...f, unitPrice: e.target.value }))} className={`${input} w-24`} />
            {addForm.unitPrice !== "" && <span className="text-xs font-medium text-slate-600">= ₹{((Number(addForm.quantity) || 0) * Number(addForm.unitPrice)).toFixed(2)}</span>}
            <button disabled={addBusy || !addForm.description.trim() || addForm.unitPrice === ""} className="rounded-lg bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">{addBusy ? "Adding…" : "Add to this bill"}</button>
          </div>
        </form>
      )}

      <div className="space-y-1 border-t border-slate-200 pt-1.5 text-xs">
        <div className="flex justify-between"><span>Items total</span><span>₹{itemsTotal.toFixed(2)}</span></div>
        {discountTotal > 0 && <div className="flex justify-between text-amber-700"><span>Discounts</span><span>-₹{discountTotal.toFixed(2)}</span></div>}
        {paidTotal > 0 && <div className="flex justify-between text-green-700"><span>Paid</span><span>₹{paidTotal.toFixed(2)}</span></div>}
        {refundTotal > 0 && <div className="flex justify-between text-red-700"><span>Refunded</span><span>-₹{refundTotal.toFixed(2)}</span></div>}
        <div className="flex justify-between font-semibold"><span>Balance due</span><span>₹{balance.toFixed(2)}</span></div>
      </div>

      {(bill.payments.length > 0 || bill.refunds.length > 0) && (
        <div className="border-t border-slate-100 pt-1.5 text-xs">
          <p className="mb-1 font-medium text-slate-500">Payment history</p>
          <ul className="space-y-0.5">
            {[...bill.payments.map((p) => ({ ...p, kind: "payment", at: p.paid_at })), ...bill.refunds.map((r) => ({ ...r, kind: "refund", at: r.refunded_at }))]
              .sort((a, b) => new Date(a.at) - new Date(b.at))
              .map((row) => (
                <li key={`${row.kind}-${row.id}`} className={`flex justify-between ${row.kind === "refund" ? "text-red-700" : "text-slate-600"}`}>
                  <span>{fmtDDMMYYTime(row.at)} · {row.kind === "refund" ? "Refund" : (row.mode || "").charAt(0) + (row.mode || "").slice(1).toLowerCase()}</span>
                  <span>{row.kind === "refund" ? "-" : ""}₹{Number(row.amount).toFixed(2)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {canUpdate && balance > 0 && (
        <form onSubmit={recordPayment} className="flex items-end gap-2 border-t border-slate-100 pt-1.5">
          <input autoFocus type="number" min="0.01" step="0.01" required placeholder="amount" value={payment.amount}
            onChange={(e) => setPayment((s) => ({ ...s, amount: e.target.value }))}
            className="w-24 rounded border border-slate-300 px-2 py-1 text-xs" />
          <select value={payment.mode} onChange={(e) => setPayment((s) => ({ ...s, mode: e.target.value }))}
            className="rounded border border-slate-300 px-2 py-1 text-xs">
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="UPI">UPI</option>
          </select>
          <button className="rounded bg-[var(--hms-btn-bg)] px-3 py-1 text-xs font-medium text-[var(--hms-btn-fg)]">Record payment</button>
        </form>
      )}

      {canUpdate && (
        <details className="border-t border-slate-100 pt-1.5 text-xs">
          <summary className="cursor-pointer text-slate-500">Discount / refund</summary>
          <form onSubmit={recordDiscount} className="mt-2 flex items-end gap-2">
            <input type="number" min="0.01" step="0.01" required placeholder="discount amount" value={discount.amount}
              onChange={(e) => setDiscount((s) => ({ ...s, amount: e.target.value }))}
              className="w-28 rounded border border-slate-300 px-2 py-1" />
            <input required placeholder="reason (required)" value={discount.reason}
              onChange={(e) => setDiscount((s) => ({ ...s, reason: e.target.value }))}
              className="flex-1 rounded border border-slate-300 px-2 py-1" />
            <button className="rounded bg-slate-700 px-3 py-1 font-medium text-[var(--hms-btn-fg)]">Apply discount</button>
          </form>
          {paidTotal > 0 && (
            <form onSubmit={recordRefund} className="mt-2 flex items-end gap-2">
              <input type="number" min="0.01" step="0.01" required placeholder="refund amount" value={refund.amount}
                onChange={(e) => setRefund((s) => ({ ...s, amount: e.target.value }))}
                className="w-28 rounded border border-slate-300 px-2 py-1" />
              <input required placeholder="reason (required)" value={refund.reason}
                onChange={(e) => setRefund((s) => ({ ...s, reason: e.target.value }))}
                className="flex-1 rounded border border-slate-300 px-2 py-1" />
              <button className="rounded bg-red-700 px-3 py-1 font-medium text-[var(--hms-btn-fg)]">Record refund</button>
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
