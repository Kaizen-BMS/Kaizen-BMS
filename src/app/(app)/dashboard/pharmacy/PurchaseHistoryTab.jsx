"use client";

import { Fragment, useEffect, useState } from "react";
import { apiGet } from "@/components/hms/api";
import { fmtDDMMYY } from "@/lib/dateFormat";

const rupee = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Everything a customer has bought, newest first — find them by name, phone or bill number.
export function PurchaseHistoryTab() {
  const [sales, setSales] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState({});

  useEffect(() => {
    apiGet("/api/pharmacy/sales").then((d) => setSales(d.sales)).catch(() => setSales([]));
  }, []);

  async function toggle(id) {
    setOpen(open === id ? null : id);
    if (!detail[id]) {
      try {
        const d = await apiGet(`/api/pharmacy/sales/${id}`);
        setDetail((x) => ({ ...x, [id]: d.bill }));
      } catch {
        setDetail((x) => ({ ...x, [id]: { bill_items: [] } }));
      }
    }
  }

  const shown = (sales || []).filter(
    (s) => !q || (s.customerName || "").toLowerCase().includes(q.toLowerCase()) || (s.phone || "").includes(q) || String(s.id) === q.trim(),
  );

  return (
    <div className="space-y-3">
      <input
        placeholder="Find a customer by name, phone or bill number…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
      />
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Customer</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Bill</th>
              <th className="px-3 py-2.5">Total</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {sales === null && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>}
            {sales && shown.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No purchases found.</td></tr>}
            {shown.map((s) => (
              <Fragment key={s.id}>
                <tr className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-medium">{s.customerName || "—"}<p className="text-xs font-normal text-slate-400">{s.phone}</p></td>
                  <td className="px-3 py-2 tabular-nums">{fmtDDMMYY(s.createdAt)}</td>
                  <td className="px-3 py-2">#{s.id}</td>
                  <td className="px-3 py-2 tabular-nums">{rupee(s.total)}</td>
                  <td className="px-3 py-2 text-xs">{String(s.status || "").replace(/_/g, " ")}{s.due > 0 ? ` · due ${rupee(s.due)}` : ""}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => toggle(s.id)} className="rounded-md px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100">{open === s.id ? "Hide" : "Items"}</button></td>
                </tr>
                {open === s.id && (
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <td colSpan={6} className="px-4 py-2 text-xs text-slate-600">
                      {!detail[s.id] ? "Loading…" : (detail[s.id].bill_items || []).map((i) => <p key={i.id}>{i.quantity} × {i.description} — {rupee(i.amount)}</p>)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
