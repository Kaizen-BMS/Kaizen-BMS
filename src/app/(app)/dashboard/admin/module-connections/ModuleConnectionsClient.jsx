"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

// Connection Center (Phase 8A — CLAUDE.md "Module Selection + Connection
// Center"), built on the Phase 3 data model/lifecycle exactly as it
// already exists (module_connections/module_connection_events, the
// PENDING→ACTIVE→PAUSED/SUSPENDED→ACTIVE|REVOKED graph in
// src/lib/moduleConnections.js) — nothing here changes that lifecycle,
// only how it's presented. A relationship diagram + a real table, not a
// workflow-graph editor (deliberately out of scope this phase).
const MODULE_KEYS = ["PHARMACY", "DOCTOR_OPD", "LAB", "BILLING", "IPD", "APPOINTMENTS"];
const MODULE_LABEL = {
  PHARMACY: "Pharmacy",
  DOCTOR_OPD: "OPD",
  LAB: "Lab",
  BILLING: "Billing",
  IPD: "IPD",
  APPOINTMENTS: "Appointments",
};

const STATUS_STYLE = {
  PENDING: "border border-amber-300 bg-amber-50 text-amber-700",
  ACTIVE: "border border-green-300 bg-green-50 text-green-700",
  PAUSED: "border border-slate-300 bg-slate-50 text-slate-600",
  SUSPENDED: "border border-orange-300 bg-orange-50 text-orange-700",
  REVOKED: "bg-slate-100 text-slate-500",
};

const NEXT_ACTIONS = {
  PENDING: [["ACTIVE", "Approve"], ["REVOKED", "Reject"]],
  ACTIVE: [["PAUSED", "Pause"], ["REVOKED", "Revoke"]],
  PAUSED: [["ACTIVE", "Resume"], ["REVOKED", "Revoke"]],
  SUSPENDED: [["ACTIVE", "Reactivate"], ["REVOKED", "Revoke"]],
  REVOKED: [],
};

const DESTRUCTIVE = new Set(["REVOKED"]);

function fmt(dt) {
  return dt ? new Date(dt).toLocaleString() : "—";
}

function Modal({ title, onClose, children, width = "max-w-md" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className={`w-full ${width} max-h-[85vh] overflow-y-auto rounded-lg bg-white p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const tone = toast.type === "error" ? "bg-red-600" : "bg-slate-900";
  return (
    <div className={`fixed bottom-4 right-4 z-50 rounded-md px-4 py-2.5 text-sm text-white shadow-lg ${tone}`}>
      {toast.text}
    </div>
  );
}

export default function ModuleConnectionsClient() {
  const [instances, setInstances] = useState([]);
  const [connections, setConnections] = useState(null);
  const [contracts, setContracts] = useState({});
  const [loadErr, setLoadErr] = useState("");
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detailsId, setDetailsId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { id, status, label }

  function notify(text, type = "success") {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    try {
      const lists = await Promise.all(
        MODULE_KEYS.map((m) =>
          apiGet(`/api/module-instances?module=${m}`).then((d) => d.instances.map((i) => ({ ...i, moduleName: m }))),
        ),
      );
      setInstances(lists.flat());
      const { connections, contracts } = await apiGet("/api/module-connections");
      setConnections(connections);
      setContracts(contracts);
    } catch (err) {
      setLoadErr(err.message);
    }
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
  }, []);

  async function transition(id, status, label) {
    setConfirmAction(null);
    try {
      await apiSend(`/api/module-connections/${id}`, "PATCH", { status });
      notify(`Connection ${label.toLowerCase()}d.`);
      await load();
    } catch (err) {
      notify(err.message, "error");
    }
  }

  function requestTransition(id, status, label) {
    if (DESTRUCTIVE.has(status)) {
      setConfirmAction({ id, status, label });
    } else {
      transition(id, status, label);
    }
  }

  // Active-only relationship diagram: source module -> the target modules
  // it currently has an ACTIVE connection to.
  const diagram = useMemo(() => {
    if (!connections) return [];
    const byModule = new Map();
    for (const c of connections) {
      if (c.status !== "ACTIVE") continue;
      const s = c.source?.moduleName;
      const t = c.target?.moduleName;
      if (!s || !t) continue;
      if (!byModule.has(s)) byModule.set(s, new Set());
      byModule.get(s).add(t);
    }
    return Array.from(byModule.entries()).map(([source, targets]) => ({ source, targets: Array.from(targets) }));
  }, [connections]);

  const activeInstances = instances.filter((i) => i.status === "ACTIVE");

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Connection Center</h1>
          <p className="mt-1 text-sm text-slate-500">Connect enabled modules and control how they work together.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          disabled={activeInstances.length < 2}
          title={activeInstances.length < 2 ? "At least two active module instances are needed to connect" : undefined}
          className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50"
        >
          + Connect Modules
        </button>
      </div>

      {loadErr && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadErr}</p>}

      {/* Relationship diagram */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold">Active relationships</p>
        {connections === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : diagram.length === 0 ? (
          <p className="text-sm text-slate-400">No active connections yet.</p>
        ) : (
          <div className="flex flex-wrap gap-6">
            {diagram.map(({ source, targets }) => (
              <div key={source} className="flex flex-col items-center gap-2">
                <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
                  {MODULE_LABEL[source] || source}
                </div>
                <div className="h-4 w-px bg-slate-300" />
                <div className="flex flex-wrap justify-center gap-2">
                  {targets.map((t) => (
                    <div key={t} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
                      {MODULE_LABEL[t] || t}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connection list */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Connections</p>
        {connections === null ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Loading…</p>
        ) : connections.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-slate-400">No module connections yet.</p>
            <p className="mt-1 text-xs text-slate-400">
              Enable a module and connect it to start building your healthcare ecosystem.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Target</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-700">{MODULE_LABEL[c.source?.moduleName] || "—"}</div>
                    <div className="text-xs text-slate-400">{c.source?.name}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-700">{MODULE_LABEL[c.target?.moduleName] || "—"}</div>
                    <div className="text-xs text-slate-400">{c.target?.name}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{fmt(c.createdAt)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{fmt(c.updatedAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => setDetailsId(c.id)} className="text-xs text-slate-400 hover:text-slate-700 hover:underline">
                        Details
                      </button>
                      {NEXT_ACTIONS[c.status].map(([status, label]) => (
                        <button
                          key={status}
                          onClick={() => requestTransition(c.id, status, label)}
                          className={`text-xs hover:underline ${DESTRUCTIVE.has(status) ? "text-red-500 hover:text-red-700" : "text-slate-400 hover:text-slate-700"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && <Toast toast={toast} />}

      {showCreate && (
        <CreateConnectionModal
          instances={instances}
          contracts={contracts}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            notify("Connection requested.");
            load();
          }}
          onError={(m) => notify(m, "error")}
        />
      )}

      {detailsId && (
        <ConnectionDetailsModal connectionId={detailsId} moduleLabel={MODULE_LABEL} onClose={() => setDetailsId(null)} />
      )}

      {confirmAction && (
        <Modal title={`${confirmAction.label} this connection?`} onClose={() => setConfirmAction(null)}>
          <p className="text-sm text-slate-600">
            {confirmAction.status === "REVOKED"
              ? "Revoking stops any data exchange over this connection. Its history is kept and this cannot be undone from here."
              : `This will ${confirmAction.label.toLowerCase()} the connection.`}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setConfirmAction(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={() => transition(confirmAction.id, confirmAction.status, confirmAction.label)}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
            >
              {confirmAction.label}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CreateConnectionModal({ instances, contracts, onClose, onCreated, onError }) {
  const [sourceModule, setSourceModule] = useState("");
  const [targetModule, setTargetModule] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);

  // Available modules pairs are derived directly from the existing
  // contract catalog (GET /api/module-connections already returns it) —
  // an admin picks Source Module / Target Module, never a "connection
  // type" name, per CLAUDE.md Phase 8A "Connection Center — create
  // connection". Only module pairs a contract actually declares appear.
  const sourceModules = Array.from(new Set(Object.values(contracts).map((c) => c.sourceModule)));
  const targetModules = Array.from(
    new Set(Object.values(contracts).filter((c) => c.sourceModule === sourceModule).map((c) => c.targetModule)),
  );
  const connectionType = Object.entries(contracts).find(
    ([, c]) => c.sourceModule === sourceModule && c.targetModule === targetModule,
  )?.[0];
  const contract = connectionType ? contracts[connectionType] : null;

  const sourceOptions = instances.filter((i) => i.moduleName === sourceModule && i.status === "ACTIVE");
  const targetOptions = instances.filter((i) => i.moduleName === targetModule && i.status === "ACTIVE");

  async function submit(e) {
    e.preventDefault();
    if (!sourceId || !targetId || !connectionType) return;
    setBusy(true);
    try {
      await apiSend("/api/module-connections", "POST", {
        sourceInstanceId: Number(sourceId),
        targetInstanceId: Number(targetId),
        connectionType,
        purpose,
      });
      onCreated();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Connect Modules" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Source module</span>
            <select
              value={sourceModule}
              onChange={(e) => {
                setSourceModule(e.target.value);
                setTargetModule("");
                setSourceId("");
                setTargetId("");
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— select —</option>
              {sourceModules.map((m) => (
                <option key={m} value={m}>{MODULE_LABEL[m] || m}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Target module</span>
            <select
              value={targetModule}
              onChange={(e) => {
                setTargetModule(e.target.value);
                setTargetId("");
              }}
              disabled={!sourceModule}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            >
              <option value="">— select —</option>
              {targetModules.map((m) => (
                <option key={m} value={m}>{MODULE_LABEL[m] || m}</option>
              ))}
            </select>
          </label>
        </div>

        {sourceModule && sourceOptions.length === 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            No active {MODULE_LABEL[sourceModule]} instance found — enable the module and add/activate an instance first.
          </p>
        )}

        {sourceModule && targetModule && !connectionType && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {MODULE_LABEL[sourceModule]} → {MODULE_LABEL[targetModule]} isn&apos;t a supported connection yet.
          </p>
        )}

        {sourceOptions.length > 0 && targetModule && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Source instance</span>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">— select —</option>
                {sourceOptions.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Target instance</span>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">— select —</option>
                {targetOptions.map((i) => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {contract && (
          <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-500">
            <p className="font-medium text-slate-600">{contract.label}</p>
            <p className="mt-1">{contract.description}</p>
          </div>
        )}

        <label className="block space-y-1 text-sm">
          <span className="font-medium">Purpose <span className="font-normal text-slate-400">(optional)</span></span>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Why is this connection needed?"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            disabled={busy || !sourceId || !targetId || !connectionType}
            className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50"
          >
            Request connection
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConnectionDetailsModal({ connectionId, moduleLabel, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet(`/api/module-connections/${connectionId}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [connectionId]);

  return (
    <Modal title="Connection details" onClose={onClose} width="max-w-lg">
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {!data ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-base font-medium text-slate-900">
              {moduleLabel[data.connection.source.moduleName] || data.connection.source.moduleName}
              <span className="mx-2 text-slate-400">→</span>
              {moduleLabel[data.connection.target.moduleName] || data.connection.target.moduleName}
            </p>
            <p className="text-xs text-slate-400">
              {data.connection.source.name} → {data.connection.target.name}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs uppercase text-slate-400">Status</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[data.connection.status]}`}>
                {data.connection.status}
              </span>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Created</p>
              <p className="mt-1 text-slate-600">{fmt(data.connection.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400">Updated</p>
              <p className="mt-1 text-slate-600">{fmt(data.connection.updatedAt)}</p>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Data references</p>
            {data.contract ? (
              <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-500">
                <p className="font-medium text-slate-600">Shared</p>
                <p className="mt-1">{data.connection.allowedFields.join(", ") || "—"}</p>
                <p className="mt-2 font-medium text-slate-600">Restricted</p>
                <p className="mt-1">{data.contract.restrictedFields.join(", ")}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Configuration available in the next integration phase.</p>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Events</p>
            <p className="text-xs text-slate-400">Configuration available in the next integration phase.</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">Workflows</p>
            <p className="text-xs text-slate-400">Configuration available in the next integration phase.</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase text-slate-400">History</p>
            <div className="space-y-1.5">
              {data.events.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-slate-500">
                    {e.fromStatus ? `${e.fromStatus} → ${e.toStatus}` : `Requested (${e.toStatus})`}
                    {e.note ? ` — ${e.note}` : ""}
                  </span>
                  <span className="shrink-0 text-slate-400">{fmt(e.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
