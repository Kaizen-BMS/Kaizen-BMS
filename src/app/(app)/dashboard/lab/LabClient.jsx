"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";
import AllergyBadge from "@/components/hms/AllergyBadge";
import { parseMaybeJson } from "@/components/hms/json";

const FLAGS = ["NORMAL", "HIGH", "LOW", "ABNORMAL"];

export default function LabClient({ permissions }) {
  const [orders, setOrders] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultingId, setResultingId] = useState(null);
  const [rows, setRows] = useState([]);
  const [justResulted, setJustResulted] = useState(null); // { id } — show a Print link briefly
  const [flashIds, setFlashIds] = useState(new Set());

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        ? tests.map((t) => ({ testName: t, result: "", units: "", referenceRange: "", flag: "NORMAL" }))
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
                Ref. Dr. {o.referring_doctor} · {tests.join(", ")}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Ordered {new Date(o.created_at).toLocaleString()}
                {o.collected_at && ` · Collected ${new Date(o.collected_at).toLocaleString()}`}
                {o.received_at && ` · Received ${new Date(o.received_at).toLocaleString()}`}
              </p>

              <div className="mt-3 flex gap-2">
                {!o.collected_at && permissions.canCollect && (
                  <button
                    onClick={() => collect(o.id)}
                    disabled={busy}
                    className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Mark collected
                  </button>
                )}
                {o.collected_at && !o.received_at && permissions.canReceive && (
                  <button
                    onClick={() => receive(o.id)}
                    disabled={busy}
                    className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Mark received
                  </button>
                )}
                {o.received_at && permissions.canResult && (
                  <button
                    onClick={() => startResult(o)}
                    disabled={busy}
                    className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
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
                      className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
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
