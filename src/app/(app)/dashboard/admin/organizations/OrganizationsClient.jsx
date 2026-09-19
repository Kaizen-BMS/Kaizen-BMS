"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

const TYPE_LABEL = { HOSPITAL: "Hospital", LAB_SOLO: "Laboratory", PHARMACY_SOLO: "Pharmacy", DOCTOR_SOLO: "Clinic" };

// Owner view: every facility this identity may work in, with real counts.
// "Open" switches the active facility (verified server-side).
export default function OrganizationsClient() {
  const [facilities, setFacilities] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    apiGet("/api/org/facilities")
      .then((d) => setFacilities(d.facilities || []))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function open(id) {
    setBusyId(id);
    try {
      await apiSend("/api/org/switch", "POST", { tenantId: id });
      window.location.assign("/dashboard");
    } catch (e) {
      setError(e.message);
      setBusyId(null);
    }
  }

  async function setEnabled(id, enabled) {
    setBusyId(id);
    setError("");
    try {
      await apiSend(`/api/org/facilities/${id}`, "PATCH", { enabled });
      load();
    } catch (e) {
      setError(e.message === "cannot_disable_active_facility" ? "Switch to another facility before deactivating this one." : `Could not update (${e.message}).`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My Organizations</h1>
        <p className="text-sm text-[var(--hms-ink-soft)]">Every hospital, pharmacy and lab you own. Open one to work inside it — its data stays separate from the others.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!facilities ? (
        <p className="text-sm text-[var(--hms-ink-soft)]">Loading…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {facilities.map((f) => (
            <div key={f.id} className="rounded-lg border p-4" style={{ borderColor: "var(--hms-border)" }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{f.name}</p>
                  <p className="text-xs text-[var(--hms-ink-soft)]">
                    {TYPE_LABEL[f.type] || f.type} · {f.publicCode}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${f.current ? "bg-blue-100 text-blue-700" : f.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {f.current ? "Working here" : f.platformSuspended ? "Suspended by Kaizen" : f.enabled ? "Active" : "Inactive"}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <dt className="text-[var(--hms-ink-faint)]">Modules</dt>
                  <dd className="text-lg font-semibold">{f.activeModules}</dd>
                </div>
                <div>
                  <dt className="text-[var(--hms-ink-faint)]">Internal links</dt>
                  <dd className="text-lg font-semibold">{f.internalConnections}</dd>
                </div>
                <div>
                  <dt className="text-[var(--hms-ink-faint)]">Partners</dt>
                  <dd className="text-lg font-semibold">{f.partnerConnections}</dd>
                </div>
              </dl>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => open(f.id)}
                  disabled={busyId === f.id || f.current || !f.enabled}
                  className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)] disabled:opacity-50"
                >
                  {f.current ? "Current" : "Open"}
                </button>
                {f.isOwner && !f.platformSuspended && (
                  <button
                    onClick={() => setEnabled(f.id, !f.enabled)}
                    disabled={busyId === f.id}
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
                    style={{ borderColor: "var(--hms-border)" }}
                  >
                    {f.enabled ? "Deactivate" : "Activate"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
