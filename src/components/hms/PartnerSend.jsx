"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "./api";
import { useRealtime } from "./useRealtime";

const ERR = {
  data_not_approved: "That partner has not approved this kind of information.",
  connection_not_active: "The connection with that partner is not active.",
  quantity_required: "Enter a quantity.",
};

const COPY = {
  PHARMACY: { title: "Ask a partner pharmacy for a medicine", who: "Pharmacy", none: "pharmacy" },
  LAB: { title: "Send a test to a partner lab", who: "Lab", none: "lab" },
  REFERRAL: { title: "Refer a patient to another hospital or clinic", who: "Send to", none: "hospital or clinic" },
};

const EMPTY = { connectionId: "", name: "", quantity: "", patientName: "", age: "", gender: "", phone: "", reason: "", summary: "" };
const money = (n) => (n != null ? ` · ₹${Number(n).toLocaleString("en-IN")}` : "");

function outcome(service, o) {
  if (o.status !== "COMPLETED") return "Waiting";
  if (service === "PHARMACY") return `Fulfilled ${o.result?.quantityFulfilled ?? ""}${money(o.result?.amount)}`;
  if (service === "LAB") return `Result: ${o.result?.findings ?? ""}${money(o.result?.amount)}`;
  return o.result?.accepted ? `Accepted · token ${o.result.token}` : `Declined${o.result?.note ? ` — ${o.result.note}` : ""}`;
}

// "Send a request to a partner" + "what I sent". Works for any facility that
// is connected to a partner offering this service (pharmacy→pharmacy,
// lab→lab, hospital→hospital referral …). Only information the partner
// approved is ever sent.
export default function PartnerSend({ service }) {
  const c = COPY[service];
  const isPh = service === "PHARMACY";
  const isRef = service === "REFERRAL";
  const [data, setData] = useState({ orders: [], targets: [] });
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiGet("/api/partners/outbound").then(setData).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useRealtime({ "partner:updated": load }, load);

  const targets = data.targets.filter((t) => t.serviceType === service);
  const sent = data.orders.filter((o) => o.serviceType === service);
  const connectionId = f.connectionId || (targets.length === 1 ? String(targets[0].connectionId) : "");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({ error: "", ok: "" });
    const body = isRef
      ? { patientName: f.patientName, ...(f.age ? { patientAge: Number(f.age) } : {}), ...(f.gender ? { patientGender: f.gender } : {}), ...(f.phone ? { patientPhone: f.phone } : {}), reason: f.reason, ...(f.summary ? { summary: f.summary } : {}) }
      : { ...(isPh ? { medicineName: f.name, quantity: Number(f.quantity) } : { testName: f.name }), ...(f.patientName ? { patientName: f.patientName } : {}) };
    try {
      await apiSend("/api/partners/direct-orders", "POST", { connectionId: Number(connectionId), ...body });
      setMsg({ error: "", ok: isRef ? "Referral sent." : "Request sent." });
      setF((x) => ({ ...EMPTY, connectionId: x.connectionId }));
      load();
    } catch (err) {
      setMsg({ error: ERR[err.message] || `Could not send (${err.message}).`, ok: "" });
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold">{c.title}</p>
      {targets.length === 0 ? (
        <p className="text-sm text-slate-500">
          No connected {c.none} yet. <a href="/dashboard/admin/partners" className="underline">Connect one in Partners</a>.
        </p>
      ) : (
        <form onSubmit={send} className="flex flex-wrap items-end gap-2">
          {targets.length > 1 && (
            <label className="text-xs">
              <span className="block text-slate-500">{c.who}</span>
              <select value={connectionId} onChange={set("connectionId")} required className={input}>
                <option value="">Choose…</option>
                {targets.map((t) => <option key={t.connectionId} value={t.connectionId}>{t.name}</option>)}
              </select>
            </label>
          )}
          {targets.length === 1 && <p className="pb-2 text-sm text-slate-600">To: {targets[0].name}</p>}
          {isRef ? (
            <>
              <label className="text-xs"><span className="block text-slate-500">Patient name</span><input required value={f.patientName} onChange={set("patientName")} className={input} /></label>
              <label className="text-xs"><span className="block text-slate-500">Age</span><input type="number" min="0" max="150" value={f.age} onChange={set("age")} className={`${input} w-20`} /></label>
              <label className="text-xs">
                <span className="block text-slate-500">Gender</span>
                <select value={f.gender} onChange={set("gender")} className={input}><option value="">—</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select>
              </label>
              <label className="text-xs"><span className="block text-slate-500">Phone</span><input value={f.phone} onChange={set("phone")} className={`${input} w-32`} /></label>
              <label className="text-xs"><span className="block text-slate-500">Reason for referral</span><input required value={f.reason} onChange={set("reason")} className={`${input} w-56`} /></label>
              <label className="text-xs"><span className="block text-slate-500">Short summary (optional)</span><input value={f.summary} onChange={set("summary")} className={`${input} w-64`} /></label>
            </>
          ) : (
            <>
              <label className="text-xs"><span className="block text-slate-500">{isPh ? "Medicine" : "Test"}</span><input required value={f.name} onChange={set("name")} className={input} /></label>
              {isPh && <label className="text-xs"><span className="block text-slate-500">Quantity</span><input required type="number" min="1" value={f.quantity} onChange={set("quantity")} className={`${input} w-24`} /></label>}
              <label className="text-xs"><span className="block text-slate-500">Patient (optional)</span><input value={f.patientName} onChange={set("patientName")} className={input} /></label>
            </>
          )}
          <button disabled={busy || !connectionId} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50">Send</button>
        </form>
      )}
      {msg.error && <p className="text-sm text-red-600">{msg.error}</p>}
      {msg.ok && <p className="text-sm text-emerald-700">{msg.ok}</p>}

      {sent.length > 0 && (
        <div className="overflow-x-auto">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Sent by us</p>
          <table className="w-full text-sm">
            <tbody>
              {sent.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2">{o.to}</td>
                  <td className="py-1.5 pr-2">
                    {isRef ? `${o.payload.patientName || ""} — ${o.payload.reason || ""}` : isPh ? `${o.payload.medicineName || ""} × ${o.payload.quantity ?? ""}` : o.payload.testName}
                    {!isRef && o.payload.patientName ? ` · ${o.payload.patientName}` : ""}
                  </td>
                  <td className="py-1.5 text-slate-500">{outcome(service, o)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
