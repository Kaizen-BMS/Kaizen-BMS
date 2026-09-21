"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";
import { useRealtime } from "@/components/hms/useRealtime";

// Workflows — Phase 9 (CLAUDE.md "Workflow Automation"). A simple,
// read-mostly status board over workflow_instances/workflow_instance_steps
// — deliberately not a workflow designer: definitions are fixed, code-
// defined shapes (src/lib/workflows/definitions.js); this screen only
// shows how real instances of them are progressing, plus a bounded Retry
// action for a stuck one. Same "plain, fast, functional" table + details
// pattern as the rest of the Administration section.

const STATUS_STYLE = {
  PENDING: "bg-slate-100 text-slate-600",
  RUNNING: "border border-blue-300 bg-blue-50 text-blue-700",
  WAITING: "border border-amber-300 bg-amber-50 text-amber-700",
  COMPLETED: "border border-green-300 bg-green-50 text-green-700",
  FAILED: "border border-red-300 bg-red-50 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

const STEP_MARK = {
  PENDING: "○",
  RUNNING: "●",
  COMPLETED: "✓",
  FAILED: "✕",
  SKIPPED: "–",
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] || "bg-slate-100 text-slate-600"}`}>
      {{ RUNNING: "In progress", WAITING: "Waiting", FAILED: "Needs attention", COMPLETED: "Done", PENDING: "Not started", CANCELLED: "Cancelled" }[status] || status}
    </span>
  );
}

function fmt(dt) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return "—";
  }
}

export default function WorkflowsClient() {
  const [workflows, setWorkflows] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const load = () => {
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    apiGet(`/api/workflows${qs}`)
      .then(({ workflows }) => setWorkflows(workflows))
      .catch((e) => setErr(e.message));
  };

  useEffect(load, [statusFilter]);

  useRealtime(
    {
      "workflow:updated": ({ workflow }) => {
        setWorkflows((prev) => {
          if (!prev) return prev;
          const exists = prev.some((w) => w.id === workflow.id);
          if (!exists) return [workflow, ...prev];
          return prev.map((w) => (w.id === workflow.id ? { ...w, ...workflow, steps: undefined } : w));
        });
      },
    },
    load,
  );

  const counts = useMemo(() => {
    const c = { RUNNING: 0, WAITING: 0, FAILED: 0, COMPLETED: 0 };
    for (const w of workflows || []) if (c[w.status] != null) c[w.status]++;
    return c;
  }, [workflows]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Process Tracker</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Follows a job from start to finish across departments — for example a prescription going to the pharmacy and then to the bill,
          a lab test from order to result, or a patient from admission to discharge. You do not have to do anything here: it runs by itself.
          Look at it only when something shows <b>Needs attention</b> — open it to see which step is stuck and press Retry.
        </p>
      </div>

      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["RUNNING", "WAITING", "FAILED", "COMPLETED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
            className={`rounded-lg border p-3 text-left transition ${
              statusFilter === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <p className={`text-2xl font-semibold ${statusFilter === s ? "text-white" : "text-slate-900"}`}>{counts[s]}</p>
            <p className={`text-xs ${statusFilter === s ? "text-slate-200" : "text-slate-500"}`}>{{ RUNNING: "In progress", WAITING: "Waiting for something", FAILED: "Needs attention", COMPLETED: "Done" }[s]}</p>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">What</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">For</th>
              <th className="px-4 py-2">Now at</th>
              <th className="px-4 py-2">Started</th>
              <th className="px-4 py-2">Last change</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {workflows === null ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : workflows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Nothing here{statusFilter ? " for this filter" : ""} yet.
                </td>
              </tr>
            ) : (
              workflows.map((w) => (
                <tr key={w.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <p className="font-medium text-slate-900">{w.definitionName}</p>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={w.status} />
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {w.referenceType} #{w.referenceId}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{w.currentStep || "—"}</td>
                  <td className="px-4 py-2 text-slate-500">{fmt(w.startedAt)}</td>
                  <td className="px-4 py-2 text-slate-500">{fmt(w.updatedAt)}</td>
                  <td className="px-4 py-2 text-right">
                    <button className="text-sm font-medium text-slate-700 hover:underline" onClick={() => setSelectedId(w.id)}>
                      Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedId != null && (
        <WorkflowDetails
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={(updated) => {
            setWorkflows((prev) => (prev ? prev.map((w) => (w.id === updated.id ? { ...w, ...updated, steps: undefined } : w)) : prev));
          }}
        />
      )}
    </div>
  );
}

function WorkflowDetails({ id, onClose, onChanged }) {
  const [workflow, setWorkflow] = useState(null);
  const [err, setErr] = useState("");
  const [retrying, setRetrying] = useState(false);

  const load = () =>
    apiGet(`/api/workflows/${id}`)
      .then(({ workflow }) => setWorkflow(workflow))
      .catch((e) => setErr(e.message));

  useEffect(load, [id]);

  useRealtime({
    "workflow:updated": ({ workflow: w }) => {
      if (w.id === id) setWorkflow((prev) => ({ ...prev, ...w, steps: prev?.steps }));
    },
  });

  const retry = async () => {
    setRetrying(true);
    setErr("");
    try {
      const { workflow } = await apiSend(`/api/workflows/${id}/retry`, "POST");
      setWorkflow(workflow);
      onChanged(workflow);
    } catch (e) {
      setErr(e.message);
    } finally {
      setRetrying(false);
    }
  };

  const canRetry = workflow && (workflow.status === "FAILED" || workflow.status === "WAITING");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {!workflow ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{workflow.definitionName}</p>
                <p className="text-xs text-slate-400">
                  Version {workflow.version} · {workflow.referenceType} #{workflow.referenceId}
                </p>
              </div>
              <StatusBadge status={workflow.status} />
            </div>
            <p className="mt-2 text-sm text-slate-500">{workflow.definitionDescription}</p>

            {workflow.lastError && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{workflow.lastError}</p>
            )}
            {err && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
              <p>Started: {fmt(workflow.startedAt)}</p>
              <p>Updated: {fmt(workflow.updatedAt)}</p>
              {workflow.completedAt && <p>Completed: {fmt(workflow.completedAt)}</p>}
              {workflow.failedAt && <p>Failed: {fmt(workflow.failedAt)}</p>}
            </div>

            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Steps</p>
              {(workflow.steps || []).map((s) => (
                <div key={s.stepCode} className="flex items-start justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className={
                        s.status === "COMPLETED"
                          ? "text-green-600"
                          : s.status === "FAILED"
                            ? "text-red-600"
                            : s.status === "RUNNING"
                              ? "text-blue-600"
                              : "text-slate-400"
                      }
                    >
                      {STEP_MARK[s.status] || "○"}
                    </span>
                    <span className="text-slate-700">{s.stepCode.replaceAll("_", " ")}</span>
                  </span>
                  <span className="text-right text-xs text-slate-400">
                    {s.status}
                    {s.attempts > 0 ? ` · ${s.attempts} attempt${s.attempts > 1 ? "s" : ""}` : ""}
                    {s.lastError ? (
                      <span className="mt-0.5 block max-w-[220px] text-red-500">{s.lastError}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50" onClick={onClose}>
                Close
              </button>
              {canRetry && (
                <button
                  className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50"
                  disabled={retrying}
                  onClick={retry}
                >
                  {retrying ? "Retrying…" : "Retry"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
