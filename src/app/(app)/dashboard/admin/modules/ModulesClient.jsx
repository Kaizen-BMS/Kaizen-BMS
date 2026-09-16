"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/components/hms/api";
import Icon from "@/components/hms/icons";

// Module Management (Phase 8A — CLAUDE.md "Module Selection + Connection
// Center"). `tenant_modules` stays the one source of truth for whether a
// module is active — this page only DISPLAYS that (composed by
// GET /api/modules from tenant_modules + module_instances +
// module_connections, all pre-existing tables). Renting/un-renting a
// module is, and remains, a SUPER_ADMIN-only platform action
// (`tenant:manage` — see rbac.js's PLATFORM_ONLY_ACTIONS and CLAUDE.md
// "RBAC security hardening"); giving a HOSPITAL_ADMIN a self-service
// enable button here would silently bypass that already-hardened
// boundary, so an inactive module shows its status read-only with a
// pointer to the account manager, never a working toggle.
const CATEGORY_ORDER = ["Clinical", "Operations", "Business", "Administration", "Analytics"];

function ModuleCard({ m }) {
  const iconKey = m.key === "DOCTOR_OPD" ? "opd" : m.key.toLowerCase();
  return (
    <div className={`rounded-lg border bg-white p-4 ${m.active ? "border-slate-200" : "border-slate-200 opacity-80"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
            <Icon name={iconKey} size={18} />
          </span>
          <div>
            <p className="font-medium text-slate-900">{m.label}</p>
            <p className="text-xs text-slate-400">{m.category}</p>
          </div>
        </div>
        {!m.rentable ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Coming soon</span>
        ) : m.active ? (
          <span className="shrink-0 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs text-green-700">● Active</span>
        ) : (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Not enabled</span>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-500">{m.description}</p>

      {m.active && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>{m.instanceCount} instance{m.instanceCount === 1 ? "" : "s"}</span>
          <span>
            Connected:{" "}
            {m.connectedModules.length === 0 ? (
              <span className="text-slate-400">none yet</span>
            ) : (
              m.connectedModules.join(", ")
            )}
          </span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        {m.active ? (
          <>
            <Link
              href={`/dashboard/admin/module-instances?module=${m.key}`}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
            >
              Configure
            </Link>
            <Link
              href="/dashboard/admin/module-connections"
              className="text-xs text-slate-400 hover:text-slate-700 hover:underline"
            >
              View connections →
            </Link>
          </>
        ) : m.rentable ? (
          <p className="text-xs text-slate-400">Contact your Kaizen account manager to enable this module.</p>
        ) : (
          <p className="text-xs text-slate-400">Not available yet.</p>
        )}
      </div>
    </div>
  );
}

export default function ModulesClient() {
  const [modules, setModules] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet("/api/modules")
      .then(({ modules }) => setModules(modules))
      .catch((e) => setErr(e.message));
  }, []);

  const grouped = useMemo(() => {
    if (!modules) return [];
    const byCategory = new Map();
    for (const m of modules) {
      if (!byCategory.has(m.category)) byCategory.set(m.category, []);
      byCategory.get(m.category).push(m);
    }
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({ category: c, items: byCategory.get(c) }));
  }, [modules]);

  const activeCount = modules ? modules.filter((m) => m.active).length : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Modules</h1>
        <p className="mt-1 text-sm text-slate-500">Choose the healthcare capabilities your organization needs.</p>
      </div>

      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {modules === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
          ))}
        </div>
      ) : modules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <p className="text-sm text-slate-500">No modules configured yet.</p>
          <p className="mt-1 text-xs text-slate-400">Enable a module to start building your healthcare ecosystem.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">{activeCount} of {modules.length} modules active</p>
          {grouped.map(({ category, items }) => (
            <div key={category} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{category}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {items.map((m) => (
                  <ModuleCard key={m.key} m={m} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
