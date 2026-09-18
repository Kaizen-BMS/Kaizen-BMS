"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/components/hms/api";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN") : "—";
}
function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }) : "—";
}

// Cross-tenant Super Admin analytics — SUPER_ADMIN only
// (analytics:platform, a PLATFORM_ONLY_ACTION — see rbac.js). Includes the
// rollup scheduler's own operational health (analytics_rollup_runs), so a
// platform operator can see whether the background job itself is running,
// not just the numbers it produces.
export default function PlatformAnalyticsClient() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [triggering, setTriggering] = useState(false);

  async function load() {
    setErr("");
    try {
      const res = await apiGet("/api/analytics/platform?range=30d");
      setData(res);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    load();
  }, []);

  async function triggerRollup() {
    setTriggering(true);
    try {
      await apiSend("/api/analytics/rollup/run", "POST", {});
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Platform Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Cross-tenant totals and rollup job health — last 30 days.</p>
        </div>
        <button
          onClick={triggerRollup}
          disabled={triggering}
          className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-2 text-sm text-[var(--hms-btn-fg)] disabled:opacity-50"
        >
          {triggering ? "Running…" : "Run rollup now"}
        </button>
      </div>

      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase text-slate-500">Total billed</div>
              <div className="mt-1 text-xl font-semibold">{money(data.totals.revenue_total)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase text-slate-500">Total collected</div>
              <div className="mt-1 text-xl font-semibold">{money(data.totals.collections_total)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase text-slate-500">OPD visits</div>
              <div className="mt-1 text-xl font-semibold">{num(data.totals.opd_visits)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs uppercase text-slate-500">Admissions</div>
              <div className="mt-1 text-xl font-semibold">{num(data.totals.admissions)}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tenant ID</th>
                  <th className="px-3 py-2">Revenue</th>
                  <th className="px-3 py-2">OPD visits</th>
                  <th className="px-3 py-2">Admissions</th>
                </tr>
              </thead>
              <tbody>
                {data.byTenant.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">No rollup data yet — trigger a rollup above.</td></tr>
                )}
                {data.byTenant.map((t) => (
                  <tr key={t.tenantId} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">{t.tenantId}</td>
                    <td className="px-3 py-2">{money(t.revenue)}</td>
                    <td className="px-3 py-2">{num(t.opdVisits)}</td>
                    <td className="px-3 py-2">{num(t.admissions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-700">Recent rollup runs</h2>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2">Completed</th>
                    <th className="px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentRollupRuns.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">No rollup runs recorded yet.</td></tr>
                  )}
                  {data.recentRollupRuns.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">{r.rollupDate}</td>
                      <td className="px-3 py-2">
                        <span className={r.status === "FAILED" ? "text-red-600" : r.status === "COMPLETED" ? "text-emerald-600" : "text-slate-500"}>{r.status}</span>
                      </td>
                      <td className="px-3 py-2">{r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}</td>
                      <td className="px-3 py-2">{r.completedAt ? new Date(r.completedAt).toLocaleString() : "—"}</td>
                      <td className="px-3 py-2 text-red-600">{r.lastError || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
