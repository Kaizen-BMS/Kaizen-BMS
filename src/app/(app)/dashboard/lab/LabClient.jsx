"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";
import { parseMaybeJson } from "@/components/hms/json";
import PartnerSend from "@/components/hms/PartnerSend";
import { WalkInTab, TestsTab, ReportsTab, PayBox } from "./LabExtras";

const FLAGS = ["NORMAL", "HIGH", "LOW", "ABNORMAL"];

export default function LabClient({ permissions }) {
  const [tab, setTab] = useState("queue");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 text-sm">
        {[["queue", "Lab queue"], ...(permissions.canWalkin ? [["walkin", "New walk-in order"]] : []), ["reports", "Reports"], ["tests", "Tests & prices"], ["partner", "Partner orders"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]" : "bg-slate-100 text-slate-600"}`}>{label}</button>
        ))}
      </div>
      {tab === "queue" && <LabQueueView permissions={permissions} />}
      {tab === "walkin" && <WalkInTab onDone={() => setTab("queue")} />}
      {tab === "reports" && <ReportsTab />}
      {tab === "tests" && <TestsTab canManage={permissions.canManageTests} />}
      {tab === "partner" && <LabPartnerTab canResult={permissions.canResult} />}
    </div>
  );
}

function LabQueueView({ permissions }) {
  const [orders, setOrders] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultingId, setResultingId] = useState(null);
  const [rows, setRows] = useState([]);
  const [justResulted, setJustResulted] = useState(null); // { id } — show a Print link briefly
  const [flashIds, setFlashIds] = useState(new Set());
  const [catalog, setCatalog] = useState({});

  function flash(id) {
    setFlashIds((s) => new Set(s).add(id));
    setTimeout(() => setFlashIds((s) => { const n = new Set(s); n.delete(id); return n; }), 2000);
  }

  async function load() {
    const { orders } = await apiGet("/api/lab/queue");
    setOrders(orders);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg(e.message));
    apiGet("/api/lab/tests").then((d) => setCatalog(Object.fromEntries(d.tests.map((t) => [t.name.toLowerCase(), t])))).catch(() => {});
  }, []);

  useRealtime(
    {
      "laborder:created": ({ labOrder }) => { flash(labOrder.id); load(); },
      "laborder:updated": ({ labOrder }) => { flash(labOrder.id); load(); },
    },
    load,
  );

  async function collect(id) {
    setBusy(true);
    setMsg("");
    try {
      await apiSend(`/api/lab/orders/${id}/collect`, "POST", {});
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function receive(id) {
    setBusy(true);
    setMsg("");
    try {
      await apiSend(`/api/lab/orders/${id}/receive`, "POST", {});
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  function startResult(order) {
    const tests = parseMaybeJson(order.tests) || [];
    setRows(
      tests.length
        ? tests.map((t) => ({ testName: t, result: "", units: catalog[String(t).toLowerCase()]?.units || "", referenceRange: catalog[String(t).toLowerCase()]?.referenceRange || "", flag: "NORMAL" }))
        : [{ testName: "", result: "", units: "", referenceRange: "", flag: "NORMAL" }],
    );
    setResultingId(order.id);
  }

  async function submitResults() {
    const results = rows.filter((r) => r.testName.trim() && r.result.trim());
    if (results.length === 0) return;
    setBusy(true);
    setMsg("");
    try {
      await apiSend(`/api/lab/orders/${resultingId}/result`, "POST", { results });
      setJustResulted({ id: resultingId });
      setResultingId(null);
      setRows([]);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Lab</h1>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {justResulted && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Report finalized.{" "}
          <a
            href={`/print/lab-report/${justResulted.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Print report →
          </a>
        </p>
      )}

      {orders.length === 0 && <p className="text-sm text-slate-400">No orders waiting.</p>}

      <div className="space-y-3">
        {orders.map((o) => {
          const tests = parseMaybeJson(o.tests) || [];
          return (
            <div
              key={o.id}
              className={`rounded-lg border border-slate-200 bg-white p-4 ${
                flashIds.has(o.id) ? "hms-flash" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {o.patient_name} <span className="text-xs font-normal text-slate-400">· {o.patient_age}y</span>
                </p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {o.status.replace(/_/g, " ")}
                </span>
              </div>
              <AllergyBadge allergies={o.patient_allergies} className="mt-1" />
              <p className="mt-1 text-xs text-slate-500">
                {o.source === "WALK_IN" ? "Walk-in" : "Doctor order"}{o.referring_doctor ? ` · Ref. ${o.source === "WALK_IN" ? "" : "Dr. "}${o.referring_doctor}` : ""} · {tests.join(", ")}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Ordered {new Date(o.created_at).toLocaleString()}
                {o.collected_at && ` · Collected ${new Date(o.collected_at).toLocaleString()}`}
                {o.received_at && ` · Received ${new Date(o.received_at).toLocaleString()}`}
              </p>

              {o.bill && <div className="mt-2"><PayBox orderId={o.id} bill={o.bill} onPaid={load} /></div>}
              <div className="mt-3 flex gap-2">
                {!o.collected_at && permissions.canCollect && (
                  <button
                    onClick={() => collect(o.id)}
                    disabled={busy}
                    className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
                  >
                    Mark collected
                  </button>
                )}
                {o.collected_at && !o.received_at && permissions.canReceive && (
                  <button
                    onClick={() => receive(o.id)}
                    disabled={busy}
                    className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
                  >
                    Mark received
                  </button>
                )}
                {o.received_at && permissions.canResult && (
                  <button
                    onClick={() => startResult(o)}
                    disabled={busy}
                    className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
                  >
                    Enter results
                  </button>
                )}
              </div>

              {resultingId === o.id && (
                <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
                  {rows.map((r, i) => (
                    <div key={i} className="grid grid-cols-5 gap-1.5">
                      <input
                        placeholder="test"
                        value={r.testName}
                        onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, testName: e.target.value } : x)))}
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                      />
                      <input
                        placeholder="result"
                        value={r.result}
                        onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, result: e.target.value } : x)))}
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                      />
                      <input
                        placeholder="units"
                        value={r.units}
                        onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, units: e.target.value } : x)))}
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                      />
                      <input
                        placeholder="reference range"
                        value={r.referenceRange}
                        onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, referenceRange: e.target.value } : x)))}
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                      />
                      <select
                        value={r.flag}
                        onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, flag: e.target.value } : x)))}
                        className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                      >
                        {FLAGS.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRows((xs) => [...xs, { testName: "", result: "", units: "", referenceRange: "", flag: "NORMAL" }])}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      + row
                    </button>
                    <button
                      onClick={submitResults}
                      disabled={busy}
                      className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
                    >
                      Finalize report
                    </button>
                    <button
                      onClick={() => { setResultingId(null); setRows([]); }}
                      className="text-xs text-slate-400"
                    >
                      cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tests sent by connected facilities: the lab enters the result here (its own
// record) and it is sent back to whoever asked.
function LabPartnerTab({ canResult }) {
  const [orders, setOrders] = useState(null);
  const [text, setText] = useState({});
  const [amounts, setAmounts] = useState({});
  const [error, setError] = useState("");

  async function load() {
    setOrders((await apiGet("/api/lab/partner-orders")).orders);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setError(e.message));
  }, []);
  useRealtime({ "partner:inbound": load, "partner:updated": load }, load);

  async function send(o) {
    setError("");
    try {
      await apiSend(`/api/lab/partner-orders/${o.id}/result`, "POST", { findings: text[o.id], ...(amounts[o.id] ? { amount: Number(amounts[o.id]) } : {}) });
      await load();
    } catch (e) {
      setError(e.message === "connection_not_active" ? "The connection with this facility is not active." : `Could not send the result (${e.message}).`);
    }
  }

  if (!orders) return <p className="text-sm text-slate-400">{error || "Loading…"}</p>;
  return (
    <div className="space-y-4">
      <PartnerSend service="LAB" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {orders.length === 0 ? (
        <p className="text-sm text-slate-400">No tests from partners yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2">From</th><th className="px-3 py-2">Patient</th><th className="px-3 py-2">Test</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Result</th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-3 py-2">{o.from}</td>
                  <td className="px-3 py-2">{o.patientName || "—"}{o.patientAge != null ? ` · ${o.patientAge}y` : ""}</td>
                  <td className="px-3 py-2">{o.testName}<p className="text-xs text-slate-400">{o.priority}</p></td>
                  <td className="px-3 py-2">{o.status === "COMPLETED" ? "Result sent" : "Waiting"}</td>
                  <td className="px-3 py-2">
                    {o.status === "RECEIVED" && canResult && o.connectionStatus === "ACTIVE" ? (
                      <div className="flex gap-1">
                        <input value={text[o.id] || ""} onChange={(e) => setText({ ...text, [o.id]: e.target.value })} placeholder="Findings" className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                        <input type="number" min="0" value={amounts[o.id] || ""} onChange={(e) => setAmounts({ ...amounts, [o.id]: e.target.value })} placeholder="₹ amount" className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                        <button onClick={() => send(o)} disabled={!(text[o.id] || "").trim()} className="rounded-md bg-[var(--hms-btn-bg)] px-2 py-1 text-xs text-[var(--hms-btn-fg)] disabled:opacity-50">Send result</button>
                      </div>
                    ) : (
                      <span className="text-xs">{o.result?.findings || ""}{o.result?.amount != null ? ` · ₹${o.result.amount}` : ""}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
