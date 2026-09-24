"use client";
import { fmtDDMMYY } from "@/lib/dateFormat";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/components/hms/api";

export default function TenantsListClient() {
  const [tenants, setTenants] = useState(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiGet("/api/admin/tenants")
      .then((d) => setTenants(d.tenants))
      .catch((e) => setMsg(e.message));
  }, []);

  const filtered = (tenants || []).filter(
    (t) => !q || t.name.toLowerCase().includes(q.toLowerCase()) || t.slug.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tenants</h1>
        <Link href="/dashboard/platform/tenants/new" className="rounded-md bg-[var(--hms-btn-bg)] px-3 py-1.5 text-sm font-medium text-[var(--hms-btn-fg)]">
          + Create tenant
        </Link>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <input
        placeholder="Search name or slug…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Modules</th>
              <th className="px-3 py-2">Staff</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {tenants === null && (
              <tr><td colSpan={6} className="px-3 py-4 text-slate-400">Loading…</td></tr>
            )}
            {tenants !== null && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-slate-400">No tenants.</td></tr>
            )}
            {filtered.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/dashboard/platform/tenants/${t.id}`} className="font-medium text-slate-900 underline">
                    {t.name}
                  </Link>
                  <span className="ml-1 text-xs text-slate-400">/{t.slug}</span>
                </td>
                <td className="px-3 py-2 text-slate-600">{t.type}</td>
                <td className="px-3 py-2 text-slate-600">{t.activeModules.join(", ") || "—"}</td>
                <td className="px-3 py-2 text-slate-600">{t.staffCount}</td>
                <td className="px-3 py-2 text-slate-500">{fmtDDMMYY(t.created_at)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${t.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {t.active ? "active" : "suspended"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
