"use client";
import { fmtDDMMYYTime } from "@/lib/dateFormat";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";

const TABS = [
  { key: "", label: "All" },
  { key: "ORDERED", label: "Pending" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "COMPLETED", label: "Completed" },
];

const PRIORITY_STYLE = {
  ROUTINE: "bg-slate-100 text-slate-600",
  URGENT: "border border-amber-300 bg-amber-50 text-amber-700",
  STAT: "border border-red-300 bg-red-50 text-red-700",
};

export default function RadiologyClient({ permissions }) {
  const [tab, setTab] = useState("");
  const [orders, setOrders] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [flashIds, setFlashIds] = useState(new Set());
  const [reportingId, setReportingId] = useState(null);
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelReason, setCancelReason] = useState("");

  function flash(id) {
    setFlashIds((s) => new Set(s).add(id));
    setTimeout(() => setFlashIds((s) => { const n = new Set(s); n.delete(id); return n; }), 2000);
  }

  async function load() {
    const qs = tab ? `?status=${tab}` : "";
    const { radiologyOrders } = await apiGet(`/api/radiology/orders${qs}`);
    setOrders(radiologyOrders);
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load().catch((e) => setMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useRealtime(
    {
      "radiologyorder:created": ({ radiologyOrder }) => { flash(radiologyOrder.id); load(); },
      "radiologyorder:updated": ({ radiologyOrder }) => { flash(radiologyOrder.id); load(); },
    },
    load,
  );

  async function run(fn) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  const schedule = (id) => run(() => apiSend(`/api/radiology/orders/${id}/schedule`, "PATCH", {}));
  const start = (id) => run(() => apiSend(`/api/radiology/orders/${id}/start`, "PATCH", {}));

  function openReport(order) {
    setReportingId(order.id);
    setFindings(order.findings || "");
    setImpression(order.impression || "");
  }

  async function submitReport() {
    if (!impression.trim()) return;
    await run(async () => {
      await apiSend(`/api/radiology/orders/${reportingId}/report`, "POST", { findings, impression });
      setReportingId(null);
      setFindings("");
      setImpression("");
    });
  }

  async function submitCancel() {
    if (!cancelReason.trim()) return;
    await run(async () => {
      await apiSend(`/api/radiology/orders/${cancellingId}/cancel`, "PATCH", { reason: cancelReason });
      setCancellingId(null);
      setCancelReason("");
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">Radiology</h1>
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm ${tab === t.key ? "border-b-2 border-slate-900 font-medium text-slate-900" : "text-slate-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {orders.length === 0 && <p className="text-sm text-slate-400">No orders in this view.</p>}

      <div className="space-y-3">
        {orders.map((o) => (
          <div
            key={o.id}
            className={`rounded-lg border border-slate-200 bg-white p-4 ${flashIds.has(o.id) ? "hms-flash" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                #{o.id} · {o.patientName}
                {o.doctorName && <span className="text-xs font-normal text-slate-400"> · ordered by Dr. {o.doctorName}</span>}
              </p>
              <div className="flex items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-xs ${PRIORITY_STYLE[o.priority] || "bg-slate-100 text-slate-600"}`}>{o.priority}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{o.status.replace(/_/g, " ")}</span>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-600">{o.studyName}</p>
            <p className="mt-1 text-xs text-slate-400">
              Ordered {fmtDDMMYYTime(o.createdAt)}
              {o.scheduledAt && ` · Scheduled ${fmtDDMMYYTime(o.scheduledAt)}`}
              {o.startedAt && ` · Started ${fmtDDMMYYTime(o.startedAt)}`}
              {o.completedAt && ` · Completed ${fmtDDMMYYTime(o.completedAt)}`}
            </p>
            {o.status === "CANCELLED" && o.cancelReason && (
              <p className="mt-1 text-xs text-red-500">Cancelled: {o.cancelReason}</p>
            )}
            {o.status === "COMPLETED" && (
              <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                {o.findings && <p><span className="font-medium">Findings:</span> {o.findings}</p>}
                <p><span className="font-medium">Impression:</span> {o.impression}</p>
              </div>
            )}

            {permissions.canManage && !["COMPLETED", "CANCELLED"].includes(o.status) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {o.status === "ORDERED" && (
                  <button onClick={() => schedule(o.id)} disabled={busy} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-50">
                    Schedule
                  </button>
                )}
                {(o.status === "ORDERED" || o.status === "SCHEDULED") && (
                  <button onClick={() => start(o.id)} disabled={busy} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-50">
                    Start
                  </button>
                )}
                {permissions.canReport && (
                  <button onClick={() => openReport(o)} disabled={busy} className="rounded-md bg-[var(--hms-btn-bg)] px-2.5 py-1 text-xs text-[var(--hms-btn-fg)] disabled:opacity-50">
                    Complete & submit report
                  </button>
                )}
                <button onClick={() => setCancellingId(o.id)} disabled={busy} className="text-xs text-red-500">
                  Cancel
                </button>
              </div>
            )}

            {reportingId === o.id && (
              <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                <textarea
                  placeholder="Findings (optional)"
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <textarea
                  placeholder="Impression (required)"
                  value={impression}
                  onChange={(e) => setImpression(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={submitReport} disabled={busy || !impression.trim()} className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-xs text-[var(--hms-btn-fg)] disabled:opacity-50">
                    Submit report
                  </button>
                  <button onClick={() => setReportingId(null)} className="text-xs text-slate-400">cancel</button>
                </div>
              </div>
            )}

            {cancellingId === o.id && (
              <div className="mt-3 flex gap-2 border-t border-slate-200 pt-3">
                <input
                  placeholder="Reason for cancelling"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
                <button onClick={submitCancel} disabled={busy || !cancelReason.trim()} className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-600 disabled:opacity-50">
                  Confirm
                </button>
                <button onClick={() => setCancellingId(null)} className="text-xs text-slate-400">back</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
