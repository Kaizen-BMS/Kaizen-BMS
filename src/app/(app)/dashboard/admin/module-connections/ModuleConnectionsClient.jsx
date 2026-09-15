"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

// Basic foundation only — Phase 3 of the platform rebuild (see CLAUDE.md
// "Platform rebuild"). Proves the data model / API / lifecycle work; the
// full authenticator-style flow (select source -> target -> review data
// -> authorize) is a later phase.
const MODULE_KEYS = ["PHARMACY", "DOCTOR_OPD", "LAB", "BILLING", "IPD", "APPOINTMENTS"];

const STATUS_STYLE = {
  PENDING: "border border-amber-300 bg-amber-50 text-amber-700",
  ACTIVE: "border border-green-300 bg-green-50 text-green-700",
  PAUSED: "border border-slate-300 bg-slate-50 text-slate-600",
  SUSPENDED: "border border-orange-300 bg-orange-50 text-orange-700",
  REVOKED: "bg-slate-100 text-slate-500",
};

const NEXT_ACTIONS = {
  PENDING: [["ACTIVE", "Approve"], ["REVOKED", "Reject"]],
  ACTIVE: [["PAUSED", "Pause"], ["SUSPENDED", "Suspend"], ["REVOKED", "Revoke"]],
  PAUSED: [["ACTIVE", "Resume"], ["REVOKED", "Revoke"]],
  SUSPENDED: [["ACTIVE", "Reactivate"], ["REVOKED", "Revoke"]],
  REVOKED: [],
};

export default function ModuleConnectionsClient() {
  const [instances, setInstances] = useState([]);
  const [connections, setConnections] = useState(null);
  const [contracts, setContracts] = useState({});
  const [connectionType, setConnectionType] = useState("PRESCRIPTION_FULFILLMENT");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const lists = await Promise.all(
        MODULE_KEYS.map((m) =>
          apiGet(`/api/module-instances?module=${m}`).then((d) =>
            d.instances.map((i) => ({ ...i, moduleName: m })),
          ),
        ),
      );
      setInstances(lists.flat());
      const { connections, contracts } = await apiGet("/api/module-connections");
      setConnections(connections);
      setContracts(contracts);
    } catch (err) {
      setMsg(err.message);
    }
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const contract = contracts[connectionType];
  const sourceOptions = instances.filter((i) => i.moduleName === contract?.sourceModule && i.status === "ACTIVE");
  const targetOptions = instances.filter((i) => i.moduleName === contract?.targetModule && i.status === "ACTIVE");

  async function createConnection(e) {
    e.preventDefault();
    if (!sourceId || !targetId) return;
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/module-connections", "POST", {
        sourceInstanceId: Number(sourceId),
        targetInstanceId: Number(targetId),
        connectionType,
      });
      setSourceId("");
      setTargetId("");
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function transition(id, status) {
    setMsg("");
    try {
      await apiSend(`/api/module-connections/${id}`, "PATCH", { status });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Module connections</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect two module instances so specific data can cross between them — never
          &quot;share everything.&quot; Each connection type only carries the fields its data
          contract declares.
        </p>
      </div>

      {msg && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}

      <form onSubmit={createConnection} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold">New connection</p>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Connection type</span>
          <select
            value={connectionType}
            onChange={(e) => {
              setConnectionType(e.target.value);
              setSourceId("");
              setTargetId("");
            }}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {Object.entries(contracts).map(([key, c]) => (
              <option key={key} value={key}>
                {c.label}
              </option>
            ))}
          </select>
          {contract && <span className="text-xs text-slate-400">{contract.description}</span>}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">From (source)</span>
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">— select —</option>
              {sourceOptions.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">To (target)</span>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">— select —</option>
              {targetOptions.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </label>
        </div>
        {contract && (
          <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-500">
            <p className="font-medium text-slate-600">Data that will be shared</p>
            <p className="mt-1">{contract.fields.join(", ")}</p>
            <p className="mt-2 font-medium text-slate-600">Restricted</p>
            <p className="mt-1">{contract.restrictedFields.join(", ")}</p>
          </div>
        )}
        <button
          disabled={busy || !sourceId || !targetId}
          className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50"
        >
          Request connection
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold">Existing connections</p>
        {connections === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : connections.length === 0 ? (
          <p className="text-sm text-slate-400">No connections yet.</p>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => (
              <div key={c.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    <span className="font-medium">{c.source.name}</span>
                    <span className="mx-1.5 text-slate-400">→</span>
                    <span className="font-medium">{c.target.name}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[c.status]}`}>
                    {c.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {contracts[c.connectionType]?.label || c.connectionType}
                </p>
                <div className="mt-2 flex gap-2">
                  {NEXT_ACTIONS[c.status].map(([status, label]) => (
                    <button
                      key={status}
                      onClick={() => transition(c.id, status)}
                      className="text-xs text-slate-400 hover:text-slate-700"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
