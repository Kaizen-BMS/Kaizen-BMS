"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

// Basic foundation only — Phase 2 of the platform rebuild (see CLAUDE.md
// "Platform rebuild"). Lets an admin see and manage the named instances
// under each module ("Main Pharmacy" vs "Emergency Pharmacy", both
// PHARMACY). No polish yet; that's a later phase.
const MODULES = [
  { key: "PHARMACY", label: "Pharmacy" },
  { key: "DOCTOR_OPD", label: "Doctor / OPD" },
  { key: "LAB", label: "Lab" },
  { key: "BILLING", label: "Billing" },
  { key: "IPD", label: "IPD / Beds" },
  { key: "APPOINTMENTS", label: "Appointments" },
];

const STATUS_STYLE = {
  ACTIVE: "border border-green-300 bg-green-50 text-green-700",
  SUSPENDED: "border border-amber-300 bg-amber-50 text-amber-700",
  ARCHIVED: "bg-slate-100 text-slate-500",
};

export default function ModuleInstancesClient() {
  const [moduleName, setModuleName] = useState("PHARMACY");
  const [instances, setInstances] = useState(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setInstances(null);
    try {
      const { instances } = await apiGet(`/api/module-instances?module=${moduleName}`);
      setInstances(instances);
    } catch (err) {
      setMsg(err.message);
    }
  }

  useEffect(() => {
    // Data fetch on module-select; state is set a tick later, not
    // synchronously — the lint rule false-positives here. `load` is
    // intentionally omitted from deps — it's redefined every render and
    // only ever needs to re-run when `moduleName` changes.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleName]);

  async function createInstance(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      await apiSend("/api/module-instances", "POST", { moduleName, name: newName.trim() });
      setNewName("");
      await load();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id, status) {
    setMsg("");
    try {
      await apiSend(`/api/module-instances/${id}`, "PATCH", { status });
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Module instances</h1>
        <p className="mt-1 text-sm text-slate-500">
          A module can have more than one named, independently-run copy — e.g. a Main Pharmacy and a
          separate Emergency Pharmacy, both using the Pharmacy module.
        </p>
      </div>

      {msg && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        {MODULES.map((m) => (
          <button
            key={m.key}
            onClick={() => setModuleName(m.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              moduleName === m.key
                ? "border-[var(--hms-btn-bg)] bg-[var(--hms-btn-bg)] text-[var(--hms-btn-fg)]"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        {instances === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : instances.length === 0 ? (
          <p className="text-sm text-slate-400">
            This module has no instances yet — it may not be active for this tenant.
          </p>
        ) : (
          <div className="space-y-2">
            {instances.map((inst) => (
              <div
                key={inst.id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{inst.name}</span>
                  {inst.is_default && (
                    <span className="ml-2 text-xs text-slate-400">(default)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[inst.status]}`}>
                    {inst.status}
                  </span>
                  {inst.status !== "ACTIVE" && (
                    <button onClick={() => setStatus(inst.id, "ACTIVE")} className="text-xs text-slate-400 hover:text-slate-700">
                      reactivate
                    </button>
                  )}
                  {inst.status === "ACTIVE" && (
                    <button onClick={() => setStatus(inst.id, "SUSPENDED")} className="text-xs text-slate-400 hover:text-slate-700">
                      suspend
                    </button>
                  )}
                  {!inst.is_default && inst.status !== "ARCHIVED" && (
                    <button onClick={() => setStatus(inst.id, "ARCHIVED")} className="text-xs text-slate-400 hover:text-red-600">
                      archive
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={createInstance} className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`e.g. "Emergency ${MODULES.find((m) => m.key === moduleName)?.label}"`}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            disabled={busy || !newName.trim()}
            className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50"
          >
            + Add instance
          </button>
        </form>
      </div>
    </div>
  );
}
